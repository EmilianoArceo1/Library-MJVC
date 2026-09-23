import { desc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../db";
import { books, posts, users } from "../../../db/schema";
import { getSessionUser } from "../../auth-server";
import { ensureWorkflowSchema } from "../../workflow-server";

type StoredForumBody = {
  text: string;
  book: string;
};

function parseStoredBody(body: string): StoredForumBody {
  try {
    const parsed = JSON.parse(body) as Partial<StoredForumBody>;
    if (typeof parsed.text === "string" && typeof parsed.book === "string") {
      return { text: parsed.text, book: parsed.book };
    }
  } catch {
    // Older rows may contain plain text instead of JSON.
  }

  return { text: body, book: "Lectura compartida" };
}

function relativeTime(value: Date | string | number): string {
  const timestamp =
    value instanceof Date ? value.getTime() : new Date(value).getTime();

  if (!Number.isFinite(timestamp)) return "Ahora";

  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "Ahora";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Hace ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "Ayer";
  if (days < 7) return `Hace ${days} días`;

  return new Date(timestamp).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
  });
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Error inesperado";
  const detail =
    error instanceof Error && error.cause instanceof Error
      ? error.cause.message
      : "";
  const combined = `${message}\n${detail}`;

  if (combined.includes("no such table")) {
    return "La base de datos del foro aún no tiene sus tablas. Aplica las migraciones de Drizzle a la D1 desplegada.";
  }

  return message;
}

export async function GET() {
  try {
    const db = getDb();
    const rows = await db
      .select({
        id: posts.id,
        userId: users.id,
        userName: users.name,
        photoKey: users.photoKey,
        body: posts.body,
        createdAt: posts.createdAt,
      })
      .from(posts)
      .leftJoin(users, eq(posts.userId, users.id))
      .orderBy(desc(posts.createdAt), desc(posts.id))
      .limit(100);

    return Response.json({
      posts: rows.map((row) => {
        const stored = parseStoredBody(row.body);

        return {
          id: -row.id,
          user: row.userName ?? "Lector",
          photoUrl:
            row.userId && row.photoKey
              ? `/api/profile/photo?userId=${encodeURIComponent(row.userId)}&v=${encodeURIComponent(row.photoKey)}`
              : null,
          book: stored.book,
          time: relativeTime(row.createdAt),
          text: stored.text,
          likes: 0,
          replies: 0,
          color: "#cf915f",
        };
      }),
    });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const identity = await getSessionUser(request);
    if (!identity) {
      return Response.json(
        { error: "Inicia sesión para publicar en el foro." },
        { status: 401 },
      );
    }
    if (!identity.emailVerified || identity.approvalStatus !== "approved") {
      return Response.json(
        { error: "Tu cuenta debe estar aprobada para publicar." },
        { status: 403 },
      );
    }

    await ensureWorkflowSchema();
    const payload = (await request.json()) as {
      text?: string;
      book?: string;
      bookId?: number;
    };

    const text = payload.text?.trim() ?? "";
    const requestedBook = payload.book?.trim() ?? "";
    const bookId = Number(payload.bookId);

    if (!text) {
      return Response.json(
        { error: "Escribe una reflexión antes de publicar." },
        { status: 400 },
      );
    }

    if (!requestedBook || !Number.isInteger(bookId) || bookId < 1) {
      return Response.json(
        { error: "Selecciona el libro relacionado." },
        { status: 400 },
      );
    }

    const db = getDb();
    const [bookRow] = await db
      .select({
        id: books.id,
        title: books.title,
        rightsStatus: books.rightsStatus,
        publicationStatus: books.publicationStatus,
      })
      .from(books)
      .where(eq(books.id, bookId))
      .limit(1);

    if (!bookRow || bookRow.publicationStatus !== "published") {
      return Response.json(
        { error: "Ese libro no está disponible en el estante." },
        { status: 404 },
      );
    }

    if (bookRow.rightsStatus === "rights_reserved") {
      const acknowledgement = await env.DB.prepare(
        "SELECT 1 AS ok FROM book_read_acknowledgements WHERE user_id = ? AND book_id = ? LIMIT 1",
      )
        .bind(identity.id, bookId)
        .first<{ ok: number }>();
      if (!acknowledgement) {
        return Response.json(
          { error: "Marca esta obra con derechos reservados como leída antes de publicar una reflexión sobre ella." },
          { status: 403 },
        );
      }
    }

    const book = bookRow.title;

    if (text.length > 5000) {
      return Response.json(
        { error: "La reflexión es demasiado larga." },
        { status: 400 },
      );
    }

    const createdAt = new Date();
    const [created] = await db
      .insert(posts)
      .values({
        bookId,
        userId: identity.id,
        body: JSON.stringify({ text, book }),
        createdAt,
      })
      .returning({
        id: posts.id,
        createdAt: posts.createdAt,
      });

    return Response.json(
      {
        post: {
          id: -created.id,
          user: identity.name,
          photoUrl: identity.photoUrl,
          book,
          time: "Ahora",
          text,
          likes: 0,
          replies: 0,
          color: "#cf915f",
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
