import { env } from "cloudflare:workers";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../../../../db";
import { books, loans } from "../../../../db/schema";
import { getSessionUser } from "../../../auth-server";
import { privateNoIndexHeaders } from "../../../rights-server";
import { ensureWorkflowSchema, isModerator } from "../../../workflow-server";

type RuntimeEnv = {
  BOOK_FILES: R2Bucket;
};

function runtimeEnv(): RuntimeEnv {
  return env as unknown as RuntimeEnv;
}

export async function GET(request: Request) {
  try {
    await ensureWorkflowSchema();
    const session = await getSessionUser(request);
    if (!session) {
      return new Response("Inicia sesión para leer este libro.", { status: 401 });
    }

    const url = new URL(request.url);
    const bookId = Number(url.searchParams.get("id"));
    if (!Number.isInteger(bookId) || bookId < 1) {
      return new Response("Libro inválido.", { status: 400 });
    }

    const db = getDb();
    const [book] = await db
      .select({
        id: books.id,
        fileKey: books.fileKey,
        publicationStatus: books.publicationStatus,
        rightsStatus: books.rightsStatus,
        reservedInternalAccess: books.reservedInternalAccess,
      })
      .from(books)
      .where(eq(books.id, bookId))
      .limit(1);

    if (!book?.fileKey) {
      return new Response("Este libro no tiene contenido de lectura asociado.", { status: 404 });
    }
    const inspectionRequested = url.searchParams.get("inspect") === "1";
    const isApprovedModerator =
      session.emailVerified &&
      session.approvalStatus === "approved" &&
      isModerator(session.role);

    if (inspectionRequested) {
      if (!isApprovedModerator) {
        return new Response("El modo de inspección es exclusivo de administradores y asesores.", {
          status: 403,
          headers: privateNoIndexHeaders("text/plain; charset=utf-8"),
        });
      }
    } else {
      if (
        book.publicationStatus !== "published" ||
        book.rightsStatus === "review" ||
        (book.rightsStatus === "rights_reserved" && !book.reservedInternalAccess)
      ) {
        return new Response("Este contenido no está disponible para lectura interna.", {
          status: 403,
          headers: privateNoIndexHeaders("text/plain; charset=utf-8"),
        });
      }

      const [loan] = await db
        .select({ id: loans.id })
        .from(loans)
        .where(
          and(
            eq(loans.userId, session.id),
            eq(loans.bookId, bookId),
            isNull(loans.returnedAt),
          ),
        )
        .limit(1);

      if (!loan) {
        return new Response("Necesitas tomar este libro antes de leerlo.", {
          status: 403,
          headers: privateNoIndexHeaders("text/plain; charset=utf-8"),
        });
      }
    }

    const object = await runtimeEnv().BOOK_FILES.get(book.fileKey);
    if (!object) {
      return new Response("No encontramos el contenido reconstruido del libro.", { status: 404 });
    }

    const headers = privateNoIndexHeaders();
    object.writeHttpMetadata(headers);
    headers.set("Cache-Control", "private, no-store, max-age=0");
    headers.set("Content-Disposition", "inline");
    headers.set("ETag", object.httpEtag);

    return new Response(object.body, { headers });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo abrir el libro.";
    return new Response(message, { status: 500 });
  }
}
