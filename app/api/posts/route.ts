import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { posts, users } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";

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

async function getForumIdentity() {
  const authenticated = await getChatGPTUser();

  return {
    id: authenticated?.userId ?? "demo-amelia",
    name:
      authenticated?.fullName ??
      authenticated?.displayName ??
      "Amelia",
  };
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
        userName: users.name,
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
    const payload = (await request.json()) as {
      text?: string;
      book?: string;
    };

    const text = payload.text?.trim() ?? "";
    const book = payload.book?.trim() ?? "";

    if (!text) {
      return Response.json(
        { error: "Escribe una reflexión antes de publicar." },
        { status: 400 },
      );
    }

    if (!book) {
      return Response.json(
        { error: "Selecciona el libro relacionado." },
        { status: 400 },
      );
    }

    if (text.length > 5000) {
      return Response.json(
        { error: "La reflexión es demasiado larga." },
        { status: 400 },
      );
    }

    const db = getDb();
    const identity = await getForumIdentity();

    await db
      .insert(users)
      .values({
        id: identity.id,
        name: identity.name,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: { name: identity.name },
      });

    const createdAt = new Date();
    const [created] = await db
      .insert(posts)
      .values({
        bookId: null,
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
