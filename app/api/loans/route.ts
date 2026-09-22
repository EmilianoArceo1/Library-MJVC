import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { books, loans, users } from "../../../db/schema";
import { getSessionUser } from "../../auth-server";

function bookDto(row: {
  id: number;
  title: string;
  author: string;
  year: number;
  pages: number;
  synopsis: string;
  type: string;
  rating: number;
  totalCopies: number;
  availableCopies: number;
  progress: number;
}) {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    year: row.year,
    pages: row.pages,
    synopsis: row.synopsis,
    type: row.type,
    rating: row.rating,
    copies: row.totalCopies,
    available: row.availableCopies,
    readers: [],
    progress: row.progress,
  };
}

export async function GET(request: Request) {
  try {
    const session = await getSessionUser(request);
    if (!session) return Response.json({ loan: null });

    const db = getDb();
    const [row] = await db
      .select({
        loanId: loans.id,
        progress: loans.progress,
        id: books.id,
        title: books.title,
        author: books.author,
        year: books.year,
        pages: books.pages,
        synopsis: books.synopsis,
        type: books.type,
        rating: books.rating,
        totalCopies: books.totalCopies,
        availableCopies: books.availableCopies,
      })
      .from(loans)
      .innerJoin(books, eq(loans.bookId, books.id))
      .where(and(eq(loans.userId, session.id), isNull(loans.returnedAt)))
      .limit(1);

    if (!row) return Response.json({ loan: null });

    return Response.json({
      loan: {
        id: row.loanId,
        progress: row.progress,
        book: bookDto(row),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo cargar tu préstamo.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSessionUser(request);
    if (!session) {
      return Response.json({ error: "Inicia sesión para tomar un libro." }, { status: 401 });
    }

    const payload = (await request.json()) as { bookId?: number };
    const bookId = Number(payload.bookId);
    if (!Number.isInteger(bookId) || bookId < 1) {
      return Response.json({ error: "Libro inválido." }, { status: 400 });
    }

    const db = getDb();
    const [current] = await db
      .select({ id: loans.id })
      .from(loans)
      .where(and(eq(loans.userId, session.id), isNull(loans.returnedAt)))
      .limit(1);

    if (current) {
      return Response.json(
        { error: "Devuelve tu lectura actual antes de tomar otra." },
        { status: 409 },
      );
    }

    const [book] = await db
      .select()
      .from(books)
      .where(eq(books.id, bookId))
      .limit(1);

    if (!book) {
      return Response.json({ error: "Ese libro ya no existe." }, { status: 404 });
    }

    if (book.availableCopies < 1) {
      return Response.json({ error: "Ese libro no está disponible." }, { status: 409 });
    }

    const borrowedAt = new Date();
    const results = await db.batch([
      db
        .insert(loans)
        .values({
          bookId,
          userId: session.id,
          borrowedAt,
          progress: 0,
        })
        .returning({ id: loans.id }),
      db
        .update(books)
        .set({ availableCopies: sql`${books.availableCopies} - 1` })
        .where(eq(books.id, bookId)),
    ]);

    const loanId = results[0][0]?.id;
    return Response.json(
      {
        loan: {
          id: loanId,
          progress: 0,
          book: bookDto({
            ...book,
            availableCopies: book.availableCopies - 1,
            progress: 0,
          }),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo tomar el libro.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getSessionUser(request);
    if (!session) {
      return Response.json({ error: "Inicia sesión para actualizar tu lectura." }, { status: 401 });
    }

    const payload = (await request.json()) as {
      loanId?: number;
      action?: "progress" | "return";
      progress?: number;
      rating?: number;
    };

    const loanId = Number(payload.loanId);
    if (!Number.isInteger(loanId) || loanId < 1) {
      return Response.json({ error: "Préstamo inválido." }, { status: 400 });
    }

    const db = getDb();
    const [active] = await db
      .select({
        id: loans.id,
        bookId: loans.bookId,
        progress: loans.progress,
        pages: books.pages,
      })
      .from(loans)
      .innerJoin(books, eq(loans.bookId, books.id))
      .where(
        and(
          eq(loans.id, loanId),
          eq(loans.userId, session.id),
          isNull(loans.returnedAt),
        ),
      )
      .limit(1);

    if (!active) {
      return Response.json({ error: "Ese préstamo ya no está activo." }, { status: 404 });
    }

    if (payload.action === "return") {
      const rating = Number(payload.rating);
      const safeRating =
        Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null;

      await db.batch([
        db
          .update(loans)
          .set({
            returnedAt: new Date(),
            progress: 100,
            rating: safeRating,
          })
          .where(eq(loans.id, loanId)),
        db
          .update(books)
          .set({ availableCopies: sql`${books.availableCopies} + 1` })
          .where(eq(books.id, active.bookId)),
        db
          .update(users)
          .set({ pagesRead: sql`${users.pagesRead} + ${active.pages}` })
          .where(eq(users.id, session.id)),
      ]);

      return Response.json({ ok: true });
    }

    const progress = Number(payload.progress);
    if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
      return Response.json({ error: "El progreso debe estar entre 0 y 100." }, { status: 400 });
    }

    await db
      .update(loans)
      .set({ progress })
      .where(eq(loans.id, loanId));

    return Response.json({ ok: true, progress });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo actualizar la lectura.";
    return Response.json({ error: message }, { status: 500 });
  }
}
