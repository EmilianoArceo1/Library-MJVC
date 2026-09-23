import { env } from "cloudflare:workers";

type PageProgressRow = {
  bookId: number;
  pages: number;
  maxProgress: number;
};

type AllPageProgressRow = PageProgressRow & {
  userId: string;
};

type ReadCountRow = {
  bookId: number;
  reads: number;
};

export async function ensureReadingMilestonesTable() {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS reading_milestones (
      loan_id INTEGER PRIMARY KEY NOT NULL,
      max_progress INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE
    )`,
  ).run();
}

export async function recordReadingProgress(loanId: number, progress: number) {
  await ensureReadingMilestonesTable();
  const safeProgress = Math.max(0, Math.min(100, Math.round(progress)));
  await env.DB.prepare(
    `INSERT INTO reading_milestones (loan_id, max_progress)
     VALUES (?, ?)
     ON CONFLICT(loan_id) DO UPDATE SET
       max_progress = MAX(reading_milestones.max_progress, excluded.max_progress)`,
  )
    .bind(loanId, safeProgress)
    .run();
}

export async function computeUserPagesRead(userId: string): Promise<number> {
  await ensureReadingMilestonesTable();
  const result = await env.DB.prepare(
    `SELECT
       l.book_id AS bookId,
       b.pages AS pages,
       MAX(
         CASE
           WHEN l.returned_at IS NOT NULL THEN 100
           ELSE MAX(COALESCE(m.max_progress, 0), COALESCE(l.progress, 0))
         END
       ) AS maxProgress
     FROM loans l
     INNER JOIN books b ON b.id = l.book_id
     LEFT JOIN reading_milestones m ON m.loan_id = l.id
     WHERE l.user_id = ? AND COALESCE(l.stats_eligible, 1) = 1
     GROUP BY l.book_id, b.pages`,
  )
    .bind(userId)
    .all<PageProgressRow>();

  return result.results.reduce((total, row) => {
    const progress = Math.max(0, Math.min(100, Number(row.maxProgress) || 0));
    return total + Math.floor((Number(row.pages) * progress) / 100);
  }, 0);
}

export async function persistUserPagesRead(userId: string, pagesRead: number) {
  await env.DB.prepare("UPDATE users SET pages_read = ? WHERE id = ?")
    .bind(Math.max(0, Math.round(pagesRead)), userId)
    .run();
}

export async function syncUserPagesRead(userId: string): Promise<number> {
  const pagesRead = await computeUserPagesRead(userId);
  await persistUserPagesRead(userId, pagesRead);
  return pagesRead;
}

export async function computeAllUserPagesRead(): Promise<Map<string, number>> {
  await ensureReadingMilestonesTable();
  const result = await env.DB.prepare(
    `SELECT
       l.user_id AS userId,
       l.book_id AS bookId,
       b.pages AS pages,
       MAX(
         CASE
           WHEN l.returned_at IS NOT NULL THEN 100
           ELSE MAX(COALESCE(m.max_progress, 0), COALESCE(l.progress, 0))
         END
       ) AS maxProgress
     FROM loans l
     INNER JOIN books b ON b.id = l.book_id
     LEFT JOIN reading_milestones m ON m.loan_id = l.id
     WHERE COALESCE(l.stats_eligible, 1) = 1
     GROUP BY l.user_id, l.book_id, b.pages`,
  ).all<AllPageProgressRow>();

  const totals = new Map<string, number>();
  for (const row of result.results) {
    const progress = Math.max(0, Math.min(100, Number(row.maxProgress) || 0));
    const pages = Math.floor((Number(row.pages) * progress) / 100);
    totals.set(row.userId, (totals.get(row.userId) ?? 0) + pages);
  }
  return totals;
}

export async function computeUniqueCompletedReadCounts(): Promise<Map<number, number>> {
  const result = await env.DB.prepare(
    `SELECT book_id AS bookId, COUNT(DISTINCT user_id) AS reads
     FROM loans
     WHERE returned_at IS NOT NULL AND COALESCE(stats_eligible, 1) = 1
     GROUP BY book_id`,
  ).all<ReadCountRow>();

  return new Map(
    result.results.map((row) => [Number(row.bookId), Number(row.reads) || 0]),
  );
}

export async function countUniqueCompletedReads(bookId: number): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(DISTINCT user_id) AS reads
     FROM loans
     WHERE book_id = ? AND returned_at IS NOT NULL AND COALESCE(stats_eligible, 1) = 1`,
  )
    .bind(bookId)
    .first<{ reads: number }>();
  return Number(row?.reads) || 0;
}
