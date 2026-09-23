import { env } from "cloudflare:workers";
import { getDb } from "../../../db";
import { books } from "../../../db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser } from "../../auth-server";
import { createNotification, ensureWorkflowSchema, isModerator } from "../../workflow-server";
import { privateNoIndexHeaders } from "../../rights-server";

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function GET(request: Request) {
  try {
    const session = await getSessionUser(request);
    if (
      !session ||
      !session.emailVerified ||
      session.approvalStatus !== "approved" ||
      !isModerator(session.role)
    ) {
      return Response.json({ error: "Acceso restringido." }, { status: 403 });
    }
    await ensureWorkflowSchema();

    const rows = await env.DB.prepare(
      `SELECT
        r.id,
        r.book_id AS bookId,
        b.title AS bookTitle,
        b.author AS bookAuthor,
        r.reporter_user_id AS reporterUserId,
        r.reporter_name AS reporterName,
        r.reporter_email AS reporterEmail,
        r.claimant_name AS claimantName,
        r.claimant_email AS claimantEmail,
        r.relationship,
        r.evidence_url AS evidenceUrl,
        r.details,
        r.status,
        r.resolution_note AS resolutionNote,
        r.resolved_by AS resolvedBy,
        r.created_at AS createdAt,
        r.updated_at AS updatedAt
       FROM copyright_reports r
       LEFT JOIN books b ON b.id = r.book_id
       ORDER BY CASE WHEN r.status IN ('pending','reviewing') THEN 0 ELSE 1 END, r.updated_at DESC
       LIMIT 300`,
    ).all();

    const headers = privateNoIndexHeaders("application/json; charset=utf-8");
    return Response.json({ reports: rows.results, viewer: { role: session.role } }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudieron cargar los reportes.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSessionUser(request);
    if (!session || !session.emailVerified || session.approvalStatus !== "approved") {
      return Response.json(
        { error: "Inicia sesión con una cuenta aprobada para reportar un problema." },
        { status: 403 },
      );
    }
    await ensureWorkflowSchema();

    const payload = (await request.json()) as {
      bookId?: number;
      claimantName?: string;
      claimantEmail?: string;
      relationship?: string;
      evidenceUrl?: string;
      details?: string;
    };

    const bookId = Number(payload.bookId);
    const claimantName = payload.claimantName?.trim().slice(0, 160) ?? "";
    const claimantEmail = payload.claimantEmail?.trim().toLowerCase().slice(0, 254) ?? "";
    const relationship = payload.relationship?.trim().slice(0, 120) ?? "";
    const evidenceUrl = payload.evidenceUrl?.trim().slice(0, 1000) ?? "";
    const details = payload.details?.trim().slice(0, 3000) ?? "";

    if (!Number.isInteger(bookId) || bookId < 1 || !claimantName || !relationship || !details) {
      return Response.json({ error: "Completa los datos de la reclamación." }, { status: 400 });
    }
    if (!validEmail(claimantEmail)) {
      return Response.json({ error: "El correo del reclamante no es válido." }, { status: 400 });
    }
    if (evidenceUrl) {
      try {
        const url = new URL(evidenceUrl);
        if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
      } catch {
        return Response.json({ error: "La URL de evidencia no es válida." }, { status: 400 });
      }
    }

    const db = getDb();
    const [book] = await db
      .select({ id: books.id, title: books.title })
      .from(books)
      .where(eq(books.id, bookId))
      .limit(1);
    if (!book) return Response.json({ error: "Libro no encontrado." }, { status: 404 });

    const now = Date.now();
    const result = await env.DB.prepare(
      `INSERT INTO copyright_reports
        (book_id, reporter_user_id, reporter_name, reporter_email,
         claimant_name, claimant_email, relationship, evidence_url, details,
         status, resolution_note, resolved_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', '', NULL, ?, ?)
       RETURNING id`,
    )
      .bind(
        bookId,
        session.id,
        session.name,
        session.email,
        claimantName,
        claimantEmail,
        relationship,
        evidenceUrl,
        details,
        now,
        now,
      )
      .first<{ id: number }>();

    const moderators = await env.DB.prepare(
      "SELECT id FROM users WHERE role IN ('admin','advisor') AND approval_status = 'approved'",
    ).all<{ id: string }>();
    for (const moderator of moderators.results) {
      await createNotification({
        userId: moderator.id,
        title: "Nueva reclamación de derechos",
        body: `${session.name} reportó un posible problema de derechos en “${book.title}”. Revisa el Centro de Gestión.`,
        kind: "copyright-report",
        createdById: session.id,
        createdByName: session.name,
      });
    }

    return Response.json(
      {
        report: { id: result?.id, status: "pending" },
        message: "Recibimos el reporte. El libro podrá ocultarse mientras se revisa.",
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo enviar el reporte.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getSessionUser(request);
    if (
      !session ||
      session.role !== "admin" ||
      !session.emailVerified ||
      session.approvalStatus !== "approved"
    ) {
      return Response.json(
        { error: "Solo un administrador puede resolver reclamaciones." },
        { status: 403 },
      );
    }
    await ensureWorkflowSchema();

    const payload = (await request.json()) as {
      id?: number;
      action?: "hide" | "resolve" | "dismiss" | "restore" | "reopen";
      resolutionNote?: string;
    };
    const id = Number(payload.id);
    const action = payload.action;
    const note = payload.resolutionNote?.trim().slice(0, 2000) ?? "";
    if (
      !Number.isInteger(id) ||
      id < 1 ||
      !action ||
      !["hide", "resolve", "dismiss", "restore", "reopen"].includes(action)
    ) {
      return Response.json({ error: "Acción inválida." }, { status: 400 });
    }

    const row = await env.DB.prepare(
      `SELECT
        r.id,
        r.book_id AS bookId,
        r.reporter_user_id AS reporterUserId,
        r.status,
        b.title AS bookTitle,
        b.rights_status AS rightsStatus
       FROM copyright_reports r
       LEFT JOIN books b ON b.id = r.book_id
       WHERE r.id = ?
       LIMIT 1`,
    )
      .bind(id)
      .first<{
        id: number;
        bookId: number;
        reporterUserId: string;
        status: string;
        bookTitle: string | null;
        rightsStatus: string | null;
      }>();
    if (!row) return Response.json({ error: "Reporte no encontrado." }, { status: 404 });

    const now = Date.now();
    let status = row.status;
    if (action === "hide") {
      await env.DB.prepare("UPDATE books SET publication_status = 'hidden' WHERE id = ?")
        .bind(row.bookId)
        .run();
      status = "reviewing";
    } else if (action === "restore") {
      if (row.rightsStatus === "review" || row.rightsStatus === "rights_reserved") {
        return Response.json(
          { error: row.rightsStatus === "rights_reserved" ? "No puedes restaurar una obra con derechos reservados sin registrar antes una autorización válida." : "No puedes restaurar un libro con derechos todavía por revisar." },
          { status: 409 },
        );
      }
      await env.DB.prepare("UPDATE books SET publication_status = 'published' WHERE id = ?")
        .bind(row.bookId)
        .run();
      status = "resolved";
    } else if (action === "resolve") {
      status = "resolved";
    } else if (action === "dismiss") {
      status = "dismissed";
    } else if (action === "reopen") {
      status = "pending";
    }

    await env.DB.prepare(
      `UPDATE copyright_reports
       SET status = ?, resolution_note = ?, resolved_by = ?, updated_at = ?
       WHERE id = ?`,
    )
      .bind(status, note, session.name, now, id)
      .run();

    await createNotification({
      userId: row.reporterUserId,
      title: "Actualización de tu reporte de derechos",
      body: `${session.name} actualizó el reporte sobre “${row.bookTitle ?? "el libro"}” a: ${status}.${note ? ` Nota: ${note}` : ""}`,
      kind: "copyright-report-update",
      createdById: session.id,
      createdByName: session.name,
    });

    return Response.json({ ok: true, status, actor: session.name });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo actualizar el reporte.";
    return Response.json({ error: message }, { status: 500 });
  }
}
