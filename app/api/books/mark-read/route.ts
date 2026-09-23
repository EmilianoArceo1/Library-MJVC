import { env } from "cloudflare:workers";
import { getDb } from "../../../../db";
import { books } from "../../../../db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser } from "../../../auth-server";
import { ensureWorkflowSchema } from "../../../workflow-server";
import { privateNoIndexHeaders } from "../../../rights-server";

export async function POST(request: Request) {
  try {
    await ensureWorkflowSchema();
    const session = await getSessionUser(request);
    if (!session || !session.emailVerified || session.approvalStatus !== "approved") {
      return Response.json(
        { error: "Tu cuenta debe estar aprobada para marcar lecturas." },
        { status: 403 },
      );
    }

    const payload = (await request.json()) as {
      bookId?: number;
      marked?: boolean;
    };
    const bookId = Number(payload.bookId);
    if (!Number.isInteger(bookId) || bookId < 1) {
      return Response.json({ error: "Libro inválido." }, { status: 400 });
    }

    const db = getDb();
    const [book] = await db
      .select({
        id: books.id,
        title: books.title,
        rightsStatus: books.rightsStatus,
        publicationStatus: books.publicationStatus,
      })
      .from(books)
      .where(eq(books.id, bookId))
      .limit(1);

    if (!book) {
      return Response.json({ error: "Libro no encontrado." }, { status: 404 });
    }
    if (book.rightsStatus !== "rights_reserved") {
      return Response.json(
        { error: "Esta opción solo existe para obras con derechos reservados." },
        { status: 409 },
      );
    }
    if (book.publicationStatus !== "published") {
      return Response.json(
        { error: "Esta obra no está disponible en el estante." },
        { status: 409 },
      );
    }

    const marked = payload.marked !== false;
    if (marked) {
      await env.DB.prepare(
        `INSERT INTO book_read_acknowledgements (user_id, book_id, marked_at, source)
         VALUES (?, ?, ?, 'external')
         ON CONFLICT(user_id, book_id) DO UPDATE SET
           marked_at = excluded.marked_at,
           source = excluded.source`,
      )
        .bind(session.id, bookId, Date.now())
        .run();
    } else {
      await env.DB.prepare(
        "DELETE FROM book_read_acknowledgements WHERE user_id = ? AND book_id = ?",
      )
        .bind(session.id, bookId)
        .run();
    }

    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS reads FROM book_read_acknowledgements WHERE book_id = ?",
    )
      .bind(bookId)
      .first<{ reads: number }>();

    const headers = privateNoIndexHeaders("application/json; charset=utf-8");
    return Response.json(
      {
        ok: true,
        marked,
        reads: Number(count?.reads) || 0,
        book: { id: book.id, title: book.title },
      },
      { headers },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo actualizar tu lectura.";
    return Response.json({ error: message }, { status: 500 });
  }
}
