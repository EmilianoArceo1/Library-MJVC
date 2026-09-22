import { env } from "cloudflare:workers";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "../../../db";
import { answers, books, loans, posts, questions } from "../../../db/schema";
import { getSessionUser } from "../../auth-server";

const MAX_BOOK_BYTES = 25 * 1024 * 1024;
const ALLOWED_BOOK_TYPES = new Map([
  ["application/pdf", "pdf"],
  ["text/plain", "txt"],
]);

type RuntimeEnv = {
  BOOK_FILES: R2Bucket;
};

function runtimeEnv(): RuntimeEnv {
  return env as unknown as RuntimeEnv;
}

function readText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function parsePositiveInteger(value: string, field: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${field} debe ser un número entero mayor que cero.`);
  }
  return parsed;
}

export async function POST(request: Request) {
  let uploadedKey: string | null = null;

  try {
    const session = await getSessionUser(request);
    if (!session) {
      return Response.json(
        { error: "Inicia sesión para subir libros." },
        { status: 401 },
      );
    }

    if (session.role !== "admin") {
      return Response.json(
        { error: "Solo un administrador puede agregar libros." },
        { status: 403 },
      );
    }

    const formData = await request.formData();
    const title = readText(formData, "title");
    const author = readText(formData, "author");
    const type = readText(formData, "type");
    const synopsis = readText(formData, "synopsis");
    const year = parsePositiveInteger(readText(formData, "year"), "El año");
    const pages = parsePositiveInteger(readText(formData, "pages"), "El número de páginas");
    const copies = parsePositiveInteger(readText(formData, "copies"), "Los ejemplares");
    const value = formData.get("file");

    if (title.length < 1 || title.length > 180) {
      return Response.json(
        { error: "El título debe tener entre 1 y 180 caracteres." },
        { status: 400 },
      );
    }

    if (author.length < 1 || author.length > 140) {
      return Response.json(
        { error: "El autor debe tener entre 1 y 140 caracteres." },
        { status: 400 },
      );
    }

    if (type.length < 1 || type.length > 60) {
      return Response.json(
        { error: "Selecciona un tipo de libro válido." },
        { status: 400 },
      );
    }

    if (synopsis.length < 1 || synopsis.length > 3000) {
      return Response.json(
        { error: "La sinopsis debe tener entre 1 y 3000 caracteres." },
        { status: 400 },
      );
    }

    if (year < 1 || year > new Date().getFullYear() + 1) {
      return Response.json(
        { error: "El año no es válido." },
        { status: 400 },
      );
    }

    if (pages > 20_000 || copies > 1_000) {
      return Response.json(
        { error: "Revisa el número de páginas o ejemplares." },
        { status: 400 },
      );
    }

    if (!(value instanceof File)) {
      return Response.json(
        { error: "Selecciona un archivo PDF o TXT." },
        { status: 400 },
      );
    }

    const fallbackType = value.name.toLowerCase().endsWith(".pdf")
      ? "application/pdf"
      : value.name.toLowerCase().endsWith(".txt")
        ? "text/plain"
        : "";
    const contentType = ALLOWED_BOOK_TYPES.has(value.type)
      ? value.type
      : fallbackType;
    const extension = ALLOWED_BOOK_TYPES.get(contentType);

    if (!extension) {
      return Response.json(
        { error: "Solo se permiten archivos PDF o TXT." },
        { status: 400 },
      );
    }

    if (value.size <= 0 || value.size > MAX_BOOK_BYTES) {
      return Response.json(
        { error: "El archivo debe pesar menos de 25 MB." },
        { status: 400 },
      );
    }

    const safeTitle = title
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70)
      .toLowerCase() || "libro";

    uploadedKey = `books/${crypto.randomUUID()}-${safeTitle}.${extension}`;
    const bucket = runtimeEnv().BOOK_FILES;

    await bucket.put(uploadedKey, value.stream(), {
      httpMetadata: {
        contentType,
        cacheControl: "private, max-age=3600",
      },
      customMetadata: {
        originalName: value.name,
        uploadedBy: session.id,
        title,
      },
    });

    const db = getDb();
    const [created] = await db
      .insert(books)
      .values({
        title,
        author,
        year,
        pages,
        synopsis,
        type,
        totalCopies: copies,
        availableCopies: copies,
        fileKey: uploadedKey,
        rating: 0,
      })
      .returning({
        id: books.id,
        title: books.title,
        author: books.author,
        year: books.year,
        pages: books.pages,
        synopsis: books.synopsis,
        type: books.type,
        totalCopies: books.totalCopies,
        availableCopies: books.availableCopies,
        rating: books.rating,
      });

    return Response.json(
      {
        book: {
          id: created.id,
          title: created.title,
          author: created.author,
          year: created.year,
          pages: created.pages,
          synopsis: created.synopsis,
          type: created.type,
          copies: created.totalCopies,
          available: created.availableCopies,
          rating: created.rating,
          readers: [],
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (uploadedKey) {
      await runtimeEnv().BOOK_FILES.delete(uploadedKey).catch(() => undefined);
    }

    const message =
      error instanceof Error ? error.message : "No se pudo guardar el libro.";
    return Response.json({ error: message }, { status: 500 });
  }
}


export async function PATCH(request: Request) {
  try {
    const session = await getSessionUser(request);
    if (!session || session.role !== "admin") {
      return Response.json(
        { error: "Solo un administrador puede editar libros." },
        { status: 403 },
      );
    }

    const payload = (await request.json()) as {
      id?: number;
      title?: string;
      author?: string;
      year?: number;
      type?: string;
      synopsis?: string;
      copies?: number;
    };

    const id = Number(payload.id);
    const title = payload.title?.trim() ?? "";
    const author = payload.author?.trim() ?? "";
    const type = payload.type?.trim() ?? "";
    const synopsis = payload.synopsis?.trim() ?? "";
    const year = Number(payload.year);
    const copies = Number(payload.copies);

    if (!Number.isInteger(id) || id < 1) {
      return Response.json({ error: "Libro inválido." }, { status: 400 });
    }
    if (!title || title.length > 180 || !author || author.length > 140) {
      return Response.json({ error: "Revisa el título y el autor." }, { status: 400 });
    }
    if (!type || type.length > 60 || !synopsis || synopsis.length > 3000) {
      return Response.json({ error: "Revisa el tipo y la sinopsis." }, { status: 400 });
    }
    if (!Number.isInteger(year) || year < 1 || year > new Date().getFullYear() + 1) {
      return Response.json({ error: "El año no es válido." }, { status: 400 });
    }
    if (!Number.isInteger(copies) || copies < 1 || copies > 1000) {
      return Response.json({ error: "Los ejemplares no son válidos." }, { status: 400 });
    }

    const db = getDb();
    const [current] = await db
      .select()
      .from(books)
      .where(eq(books.id, id))
      .limit(1);

    if (!current) {
      return Response.json({ error: "Ese libro ya no existe." }, { status: 404 });
    }

    const borrowed = Math.max(0, current.totalCopies - current.availableCopies);
    if (copies < borrowed) {
      return Response.json(
        { error: `No puedes bajar a ${copies} ejemplares porque hay ${borrowed} prestados.` },
        { status: 409 },
      );
    }

    const [updated] = await db
      .update(books)
      .set({
        title,
        author,
        year,
        type,
        synopsis,
        totalCopies: copies,
        availableCopies: copies - borrowed,
      })
      .where(eq(books.id, id))
      .returning();

    return Response.json({
      book: {
        id: updated.id,
        title: updated.title,
        author: updated.author,
        year: updated.year,
        pages: updated.pages,
        synopsis: updated.synopsis,
        type: updated.type,
        copies: updated.totalCopies,
        available: updated.availableCopies,
        rating: updated.rating,
        readers: [],
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo editar el libro.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getSessionUser(request);
    if (!session || session.role !== "admin") {
      return Response.json(
        { error: "Solo un administrador puede eliminar libros." },
        { status: 403 },
      );
    }

    const url = new URL(request.url);
    const id = Number(url.searchParams.get("id"));
    if (!Number.isInteger(id) || id < 1) {
      return Response.json({ error: "Libro inválido." }, { status: 400 });
    }

    const db = getDb();
    const [book] = await db
      .select({
        id: books.id,
        fileKey: books.fileKey,
      })
      .from(books)
      .where(eq(books.id, id))
      .limit(1);

    if (!book) {
      return Response.json({ error: "Ese libro ya no existe." }, { status: 404 });
    }

    const activeLoans = await db
      .select({ id: loans.id })
      .from(loans)
      .where(and(eq(loans.bookId, id), isNull(loans.returnedAt)))
      .limit(1);

    if (activeLoans.length > 0) {
      return Response.json(
        { error: "No puedes eliminar este libro mientras esté prestado." },
        { status: 409 },
      );
    }

    const questionRows = await db
      .select({ id: questions.id })
      .from(questions)
      .where(eq(questions.bookId, id));
    const questionIds = questionRows.map((row) => row.id);

    if (questionIds.length > 0) {
      await db.delete(answers).where(inArray(answers.questionId, questionIds));
    }

    await db.batch([
      db.delete(questions).where(eq(questions.bookId, id)),
      db.delete(posts).where(eq(posts.bookId, id)),
      db.delete(loans).where(eq(loans.bookId, id)),
      db.delete(books).where(eq(books.id, id)),
    ]);

    if (book.fileKey) {
      await runtimeEnv().BOOK_FILES.delete(book.fileKey).catch(() => undefined);
    }

    return Response.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo eliminar el libro.";
    return Response.json({ error: message }, { status: 500 });
  }
}
