import { and, eq, ne } from "drizzle-orm";
import { getDb } from "../../../db";
import { answers, questions, users } from "../../../db/schema";
import { getSessionUser } from "../../auth-server";

export async function GET(request: Request) {
  try {
    const session = await getSessionUser(request);
    if (!session) {
      return Response.json(
        { error: "Inicia sesión para ver las preguntas de lectura." },
        { status: 401 },
      );
    }

    const url = new URL(request.url);
    const bookId = Number(url.searchParams.get("bookId"));
    if (!Number.isInteger(bookId) || bookId < 1) {
      return Response.json({ error: "Libro inválido." }, { status: 400 });
    }

    const db = getDb();
    const [questionRows, answeredRows] = await Promise.all([
      db
        .select({
          id: questions.id,
          body: questions.body,
          userId: questions.userId,
          userName: users.name,
          createdAt: questions.createdAt,
        })
        .from(questions)
        .innerJoin(users, eq(questions.userId, users.id))
        .where(and(eq(questions.bookId, bookId), ne(questions.userId, session.id)))
        .orderBy(questions.createdAt),
      db
        .select({ questionId: answers.questionId })
        .from(answers)
        .where(eq(answers.userId, session.id)),
    ]);

    const answered = new Set(answeredRows.map((row) => row.questionId));
    const pending = questionRows.filter((row) => !answered.has(row.id));
    const required = pending.slice(0, 3);

    return Response.json({
      questions: required.map((row) => ({
        id: row.id,
        body: row.body,
        user: row.userName,
      })),
      totalPending: pending.length,
      extraPending: Math.max(0, pending.length - required.length),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudieron cargar las preguntas.";
    return Response.json({ error: message }, { status: 500 });
  }
}
