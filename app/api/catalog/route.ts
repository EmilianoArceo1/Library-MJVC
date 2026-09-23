import { env } from "cloudflare:workers";
import { eq, isNull } from "drizzle-orm";
import { getDb } from "../../../db";
import { books, loans, users } from "../../../db/schema";
import { computeAllUserPagesRead, computeUniqueCompletedReadCounts, persistUserPagesRead } from "../../reading-stats";
import { ensureWorkflowSchema } from "../../workflow-server";

export async function GET() {
  try {
    await ensureWorkflowSchema();
    const db = getDb();

    const [bookRows, userRows, activeLoanRows, pagesReadByUser, readCounts, rejectedModeratedBooks] =
      await Promise.all([
        db.select().from(books).where(eq(books.publicationStatus, "published")).orderBy(books.title),
        db
          .select({
            id: users.id,
            name: users.name,
            pagesRead: users.pagesRead,
            role: users.role,
            approvalStatus: users.approvalStatus,
            photoKey: users.photoKey,
          })
          .from(users)
          .orderBy(users.name),
        db
          .select({
            userId: loans.userId,
            title: books.title,
          })
          .from(loans)
          .innerJoin(books, eq(loans.bookId, books.id))
          .where(isNull(loans.returnedAt)),
        computeAllUserPagesRead(),
        computeUniqueCompletedReadCounts(),
        env.DB.prepare(
          "SELECT created_book_id AS bookId FROM book_upload_requests WHERE status = 'rejected' AND created_book_id IS NOT NULL",
        ).all<{ bookId: number }>(),
      ]);

    const currentReading = new Map(
      activeLoanRows.map((row) => [row.userId, row.title]),
    );

    await Promise.all(
      userRows
        .filter(
          (user) => user.pagesRead !== (pagesReadByUser.get(user.id) ?? 0),
        )
        .map((user) =>
          persistUserPagesRead(user.id, pagesReadByUser.get(user.id) ?? 0),
        ),
    );

    const hiddenBookIds = new Set(
      rejectedModeratedBooks.results.map((row) => Number(row.bookId)),
    );

    return Response.json({
      books: bookRows.filter((book) => !hiddenBookIds.has(book.id)).map((book) => ({
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
      people: userRows
        .filter((user) => user.approvalStatus === "approved")
        .map((user) => ({
          id: user.id,
          name: user.name,
          pages: pagesReadByUser.get(user.id) ?? 0,
          role: user.role,
          now: currentReading.get(user.id) ?? null,
          photoUrl: user.photoKey
            ? `/api/profile/photo?userId=${encodeURIComponent(user.id)}&v=${encodeURIComponent(user.photoKey)}`
            : null,
        }))
        .sort(
          (left, right) =>
            right.pages - left.pages ||
            left.name.localeCompare(right.name, "es", { sensitivity: "base" }),
        ),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo cargar la biblioteca.";
    return Response.json({ error: message }, { status: 500 });
  }
}
