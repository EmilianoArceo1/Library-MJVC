import { env } from "cloudflare:workers";
import { getDb } from "../../../db";
import { books } from "../../../db/schema";
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
