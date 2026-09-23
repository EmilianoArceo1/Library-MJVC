import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { answers, books, loans, questions } from "../../../db/schema";
import { getSessionUser } from "../../auth-server";
import { countUniqueCompletedReads, recordReadingProgress, syncUserPagesRead } from "../../reading-stats";
import { ensureWorkflowSchema } from "../../workflow-server";
import { privateNoIndexHeaders } from "../../rights-server";

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
    await ensureWorkflowSchema();
    const session = await getSessionUser(request);
    if (!session) {
      return Response.json({ error: "Inicia sesión para tomar un libro." }, { status: 401 });
    }
    if (!session.emailVerified || session.approvalStatus !== "approved") {
      return Response.json(
        { error: "Tu cuenta debe estar aprobada antes de tomar libros." },
        { status: 403 },
      );
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

    if (book.publicationStatus !== "published" || book.rightsStatus === "review" || book.rightsStatus === "rights_reserved") {
      return Response.json(
        { error: "Este libro está oculto mientras se revisa su situación de derechos." },
        { status: 403, headers: privateNoIndexHeaders("application/json; charset=utf-8") },
      );
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
    if (typeof loanId === "number") await recordReadingProgress(loanId, 0);
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
      question?: string;
      answers?: Array<{ questionId?: number; body?: string }>;
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
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return Response.json(
          { error: "Selecciona una calificación de 1 a 5 estrellas." },
          { status: 400 },
        );
      }

      const proposedQuestion = (payload.question ?? "").trim();
      if (proposedQuestion.length > 500) {
        return Response.json(
          { error: "La pregunta propuesta no puede superar 500 caracteres." },
          { status: 400 },
        );
      }

      const [questionRows, answeredRows] = await Promise.all([
        db
          .select({
            id: questions.id,
            userId: questions.userId,
          })
          .from(questions)
          .where(eq(questions.bookId, active.bookId))
          .orderBy(questions.createdAt),
        db
          .select({ questionId: answers.questionId })
          .from(answers)
          .where(eq(answers.userId, session.id)),
      ]);

      const alreadyAnswered = new Set(
        answeredRows.map((row) => row.questionId),
      );
      const requiredQuestionIds = questionRows
        .filter(
          (row) =>
            row.userId !== session.id && !alreadyAnswered.has(row.id),
        )
        .slice(0, 3)
        .map((row) => row.id);

      const submittedAnswers = Array.isArray(payload.answers)
        ? payload.answers
        : [];
      const answerMap = new Map<number, string>();
      for (const answer of submittedAnswers) {
        const questionId = Number(answer.questionId);
        const body = (answer.body ?? "").trim();
        if (
          Number.isInteger(questionId) &&
          questionId > 0 &&
          body.length > 0 &&
          body.length <= 2000
        ) {
          answerMap.set(questionId, body);
        }
      }

      const missingRequired = requiredQuestionIds.some(
        (questionId) => !answerMap.get(questionId),
      );
      if (missingRequired) {
        return Response.json(
          {
            error:
              "Responde las preguntas mostradas. Nunca te pediremos más de 3 por devolución.",
          },
          { status: 400 },
        );
      }

      for (const questionId of requiredQuestionIds) {
        const body = answerMap.get(questionId);
        if (!body) continue;
        await db.insert(answers).values({
          questionId,
          userId: session.id,
          body,
        });
      }

      if (proposedQuestion) {
        await db.insert(questions).values({
          bookId: active.bookId,
          userId: session.id,
          body: proposedQuestion,
          createdAt: new Date(),
        });
      }

      await db.batch([
        db
          .update(loans)
          .set({
            returnedAt: new Date(),
            progress: 100,
            rating,
          })
          .where(eq(loans.id, loanId)),
        db
          .update(books)
          .set({ availableCopies: sql`${books.availableCopies} + 1` })
          .where(eq(books.id, active.bookId)),
      ]);

      await recordReadingProgress(loanId, 100);
      const [pagesRead, uniqueReads] = await Promise.all([
        syncUserPagesRead(session.id),
        countUniqueCompletedReads(active.bookId),
      ]);

      const loanRows = await db
        .select({ rating: loans.rating })
        .from(loans)
        .where(eq(loans.bookId, active.bookId));
      const ratings = loanRows
        .map((row) => row.rating)
        .filter((value): value is number => typeof value === "number");
      const averageRating =
        ratings.length > 0
          ? Math.round(
              (ratings.reduce((total, value) => total + value, 0) /
                ratings.length) *
                100,
            ) / 100
          : 0;

      await db
        .update(books)
        .set({ rating: averageRating })
        .where(eq(books.id, active.bookId));

      return Response.json({
        ok: true,
        rating: averageRating,
        reads: uniqueReads,
        pagesRead,
      });
    }

    const progress = Number(payload.progress);
    if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
      return Response.json({ error: "El progreso debe estar entre 0 y 100." }, { status: 400 });
    }

    await db
      .update(loans)
      .set({ progress })
      .where(eq(loans.id, loanId));

    await recordReadingProgress(loanId, progress);
    const pagesRead = await syncUserPagesRead(session.id);

    return Response.json({ ok: true, progress, pagesRead });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo actualizar la lectura.";
    return Response.json({ error: message }, { status: 500 });
  }
}
