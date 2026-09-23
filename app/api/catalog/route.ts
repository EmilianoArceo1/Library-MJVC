import { and, eq, isNull, ne } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../db";
import { books, loans, users } from "../../../db/schema";
import { computeAllUserPagesRead, computeUniqueCompletedReadCounts, persistUserPagesRead } from "../../reading-stats";
import { ensureWorkflowSchema } from "../../workflow-server";
import { privateNoIndexHeaders } from "../../rights-server";
import { getSessionUser } from "../../auth-server";

export async function GET(request: Request) {
  try {
    await ensureWorkflowSchema();
    const db = getDb();
    const session = await getSessionUser(request);

    const [bookRows, userRows, activeLoanRows, pagesReadByUser, readCounts] =
      await Promise.all([
        db.select().from(books).where(and(eq(books.publicationStatus, "published"), ne(books.rightsStatus, "review"))).orderBy(books.title),
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
      ]);

    const currentReading = new Map(
      activeLoanRows.map((row) => [row.userId, row.title]),
    );

    const acknowledgementRows = await env.DB.prepare(
      "SELECT user_id AS userId, book_id AS bookId FROM book_read_acknowledgements",
    ).all<{ userId: string; bookId: number }>();
    const reservedReadCounts = new Map<number, number>();
    const markedByViewer = new Set<number>();
    for (const row of acknowledgementRows.results) {
      const bookId = Number(row.bookId);
      reservedReadCounts.set(bookId, (reservedReadCounts.get(bookId) ?? 0) + 1);
      if (session && row.userId === session.id) markedByViewer.add(bookId);
    }

    await Promise.all(
      userRows
        .filter(
          (user) => user.pagesRead !== (pagesReadByUser.get(user.id) ?? 0),
        )
        .map((user) =>
          persistUserPagesRead(user.id, pagesReadByUser.get(user.id) ?? 0),
        ),
    );

    const headers = privateNoIndexHeaders("application/json; charset=utf-8");
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
        reads: book.rightsStatus === "rights_reserved" ? (reservedReadCounts.get(book.id) ?? 0) : (readCounts.get(book.id) ?? 0),
        rightsStatus: book.rightsStatus,
        rightsHolder: book.rightsHolder,
        rightsSourceUrl: book.rightsSourceUrl,
        reservedInternalAccess: Boolean(book.reservedInternalAccess),
        hasInternalContent: Boolean(book.fileKey),
        markedRead: markedByViewer.has(book.id),
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
    }, { headers });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo cargar la biblioteca.";
    return Response.json({ error: message }, { status: 500 });
  }
}
