import { desc, eq, isNull } from "drizzle-orm";
import { getDb } from "../../../db";
import { books, loans, users } from "../../../db/schema";

export async function GET() {
  try {
    const db = getDb();

    const [bookRows, userRows, activeLoanRows, loanRows] = await Promise.all([
      db.select().from(books).orderBy(books.title),
      db
        .select({
          id: users.id,
          name: users.name,
          pagesRead: users.pagesRead,
          role: users.role,
          photoKey: users.photoKey,
        })
        .from(users)
        .orderBy(desc(users.pagesRead), users.name),
      db
        .select({
          userId: loans.userId,
          title: books.title,
        })
        .from(loans)
        .innerJoin(books, eq(loans.bookId, books.id))
        .where(isNull(loans.returnedAt)),
      db.select({ bookId: loans.bookId }).from(loans),
    ]);

    const currentReading = new Map(
      activeLoanRows.map((row) => [row.userId, row.title]),
    );
    const readCounts = new Map<number, number>();
    for (const loan of loanRows) {
      readCounts.set(loan.bookId, (readCounts.get(loan.bookId) ?? 0) + 1);
    }

    return Response.json({
      books: bookRows.map((book) => ({
        id: book.id,
        title: book.title,
        author: book.author,
        year: book.year,
        pages: book.pages,
        type: book.type,
        synopsis: book.synopsis,
        rating: book.rating,
        available: book.availableCopies,
        copies: book.totalCopies,
        reads: readCounts.get(book.id) ?? 0,
        readers: [],
      })),
      people: userRows.map((user) => ({
        id: user.id,
        name: user.name,
        pages: user.pagesRead,
        role: user.role,
        now: currentReading.get(user.id) ?? null,
        photoUrl: user.photoKey
          ? `/api/profile/photo?userId=${encodeURIComponent(user.id)}&v=${encodeURIComponent(user.photoKey)}`
          : null,
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo cargar la biblioteca.";
    return Response.json({ error: message }, { status: 500 });
  }
}
