import { env } from "cloudflare:workers";
import { getDb } from "../../../db";
import { books } from "../../../db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser } from "../../auth-server";
import {
  createNotification,
  ensureWorkflowSchema,
  isModerator,
} from "../../workflow-server";

type Decision = "approved" | "rejected";
type RequestType = "registration" | "book";

function decisionLabel(value: Decision) {
  return value === "approved" ? "aprobó" : "rechazó";
}

async function requireModerator(request: Request) {
  const session = await getSessionUser(request);
  if (
    !session ||
    !isModerator(session.role) ||
    !session.emailVerified || session.approvalStatus !== "approved"
  ) {
    return null;
  }
  return session;
}

export async function GET(request: Request) {
  try {
    const session = await requireModerator(request);
    if (!session) {
      return Response.json(
        { error: "Solo administradores y asesores aprobados pueden revisar solicitudes." },
        { status: 403 },
      );
    }

    await ensureWorkflowSchema();

    const [registrations, booksRequests, history] = await Promise.all([
      env.DB.prepare(
        `SELECT
          r.id,
          r.user_id AS userId,
          r.requester_name AS name,
          r.requester_email AS email,
          r.status,
          r.requested_at AS requestedAt,
          r.updated_at AS updatedAt,
          r.last_decision_by AS lastDecisionBy,
          r.last_decision_at AS lastDecisionAt,
          u.role,
          u.approval_status AS approvalStatus
         FROM account_requests r
         LEFT JOIN users u ON u.id = r.user_id
         ORDER BY CASE WHEN r.status = 'pending' THEN 0 ELSE 1 END, r.updated_at DESC`,
      ).all(),
      env.DB.prepare(
        `SELECT
          id,
          user_id AS userId,
          requester_name AS requesterName,
          requester_email AS requesterEmail,
          title,
          author,
          year,
          pages,
          synopsis,
          type,
          copies,
          original_name AS originalName,
          status,
          created_book_id AS createdBookId,
          requested_at AS requestedAt,
          updated_at AS updatedAt,
          last_decision_by AS lastDecisionBy,
          last_decision_at AS lastDecisionAt,
          rights_status AS rightsStatus,
          rights_holder AS rightsHolder,
          rights_source_url AS rightsSourceUrl,
          rights_permission_by AS rightsPermissionBy,
          rights_notes AS rightsNotes,
          CASE WHEN rights_evidence_key IS NULL THEN 0 ELSE 1 END AS rightsEvidenceAvailable
         FROM book_upload_requests
         ORDER BY CASE WHEN status = 'pending' THEN 0 ELSE 1 END, updated_at DESC`,
      ).all(),
      env.DB.prepare(
        `SELECT
          id,
          request_type AS requestType,
          request_id AS requestId,
          decision,
          actor_id AS actorId,
          actor_name AS actorName,
          message,
          created_at AS createdAt
         FROM request_decisions
         ORDER BY created_at DESC
         LIMIT 300`,
      ).all(),
    ]);

    return Response.json({
      registrations: registrations.results,
      bookRequests: booksRequests.results,
      history: history.results,
      viewer: { role: session.role, name: session.name },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudieron cargar las solicitudes.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireModerator(request);
    if (!session) {
      return Response.json(
        { error: "Solo administradores y asesores aprobados pueden dictaminar solicitudes." },
        { status: 403 },
      );
    }

    await ensureWorkflowSchema();
    const payload = (await request.json()) as {
      type?: RequestType;
      id?: number;
      decision?: Decision;
      message?: string;
    };

    const type = payload.type;
    const id = Number(payload.id);
    const decision = payload.decision;
    const note = payload.message?.trim() ?? "";

    if (
      (type !== "registration" && type !== "book") ||
      !Number.isInteger(id) ||
      id < 1 ||
      (decision !== "approved" && decision !== "rejected")
    ) {
      return Response.json({ error: "Dictamen inválido." }, { status: 400 });
    }

    if (note.length > 1200) {
      return Response.json({ error: "El mensaje es demasiado largo." }, { status: 400 });
    }

    const now = Date.now();

    if (type === "registration") {
      const row = await env.DB.prepare(
        `SELECT
          r.id,
          r.user_id AS userId,
          r.requester_name AS name,
          r.requester_email AS email,
          u.role AS currentRole
         FROM account_requests r
         LEFT JOIN users u ON u.id = r.user_id
         WHERE r.id = ?
         LIMIT 1`,
      )
        .bind(id)
        .first<{
          id: number;
          userId: string;
          name: string;
          email: string;
          currentRole: string | null;
        }>();

      if (!row || !row.currentRole) {
        return Response.json({ error: "Solicitud de registro no encontrada o cuenta eliminada." }, { status: 404 });
      }
      if (row.userId === session.id) {
        return Response.json(
          { error: "No puedes dictaminar tu propia solicitud." },
          { status: 409 },
        );
      }
      if (session.role === "advisor" && row.currentRole !== "reader") {
        return Response.json(
          { error: "Los asesores solo pueden dictaminar cuentas de lectores." },
          { status: 403 },
        );
      }

      await env.DB.prepare(
        `UPDATE account_requests
         SET status = ?, updated_at = ?, last_decision_by = ?, last_decision_at = ?
         WHERE id = ?`,
      )
        .bind(decision, now, session.name, now, id)
        .run();

      await env.DB.prepare(
        "UPDATE users SET approval_status = ? WHERE id = ?",
      )
        .bind(decision, row.userId)
        .run();

      await env.DB.prepare(
        `INSERT INTO request_decisions
          (request_type, request_id, decision, actor_id, actor_name, message, created_at)
         VALUES ('registration', ?, ?, ?, ?, ?, ?)`,
      )
        .bind(String(id), decision, session.id, session.name, note, now)
        .run();

      const verb = decisionLabel(decision);
      await createNotification({
        userId: row.userId,
        title:
          decision === "approved"
            ? "Tu registro fue aprobado"
            : "Tu registro fue rechazado",
        body: `${session.name} ${verb} tu solicitud de registro.${note ? ` Mensaje: ${note}` : ""}`,
        kind: "registration-decision",
        createdById: session.id,
        createdByName: session.name,
      });

      return Response.json({ ok: true, type, id, decision, actor: session.name });
    }

    const requestRow = await env.DB.prepare(
      `SELECT
        id,
        user_id AS userId,
        requester_name AS requesterName,
        title,
        author,
        year,
        pages,
        synopsis,
        type,
        copies,
        file_key AS fileKey,
        status,
        created_book_id AS createdBookId,
        rights_status AS rightsStatus,
        rights_holder AS rightsHolder,
        rights_source_url AS rightsSourceUrl,
        rights_permission_by AS rightsPermissionBy,
        rights_notes AS rightsNotes,
        rights_evidence_key AS rightsEvidenceKey
       FROM book_upload_requests
       WHERE id = ?
       LIMIT 1`,
    )
      .bind(id)
      .first<{
        id: number;
        userId: string;
        requesterName: string;
        title: string;
        author: string;
        year: number;
        pages: number;
        synopsis: string;
        type: string;
        copies: number;
        fileKey: string;
        status: string;
        createdBookId: number | null;
        rightsStatus: string;
        rightsHolder: string;
        rightsSourceUrl: string;
        rightsPermissionBy: string;
        rightsNotes: string;
        rightsEvidenceKey: string | null;
      }>();

    if (!requestRow) {
      return Response.json({ error: "Solicitud de libro no encontrada." }, { status: 404 });
    }
    if (requestRow.userId === session.id) {
      return Response.json(
        { error: "No puedes dictaminar tu propia propuesta de libro." },
        { status: 409 },
      );
    }
    if (decision === "approved" && (requestRow.rightsStatus === "review" || requestRow.rightsStatus === "rights_reserved")) {
      return Response.json(
        { error: requestRow.rightsStatus === "rights_reserved" ? "No se puede aprobar una obra con derechos reservados sin registrar antes una autorización válida." : "No se puede aprobar este libro mientras su situación de derechos esté por revisar." },
        { status: 409 },
      );
    }

    let createdBookId = requestRow.createdBookId;
    const db = getDb();
    if (decision === "approved" && createdBookId) {
      const [existingBook] = await db
        .select({ id: books.id })
        .from(books)
        .where(eq(books.id, createdBookId))
        .limit(1);
      if (!existingBook) createdBookId = null;
    }

    if (decision === "approved" && !createdBookId) {
      const [created] = await db
        .insert(books)
        .values({
          title: requestRow.title,
          author: requestRow.author,
          year: requestRow.year,
          pages: requestRow.pages,
          synopsis: requestRow.synopsis,
          type: requestRow.type,
          totalCopies: requestRow.copies,
          availableCopies: requestRow.copies,
          fileKey: requestRow.fileKey,
          rating: 0,
          publicationStatus: decision === "approved" ? "published" : "hidden",
          rightsStatus: requestRow.rightsStatus as any,
          rightsHolder: requestRow.rightsHolder,
          rightsSourceUrl: requestRow.rightsSourceUrl,
          rightsPermissionBy: requestRow.rightsPermissionBy,
          rightsNotes: requestRow.rightsNotes,
          rightsEvidenceKey: requestRow.rightsEvidenceKey,
          rightsVerifiedAt: decision === "approved" ? now : null,
          rightsVerifiedBy: decision === "approved" ? session.name : null,
        })
        .returning({ id: books.id });

      createdBookId = created.id;
    }

    if (createdBookId) {
      await db
        .update(books)
.set({
          publicationStatus: decision === "approved" ? "published" : "hidden",
          rightsStatus: requestRow.rightsStatus as any,
          rightsHolder: requestRow.rightsHolder,
          rightsSourceUrl: requestRow.rightsSourceUrl,
          rightsPermissionBy: requestRow.rightsPermissionBy,
          rightsNotes: requestRow.rightsNotes,
          rightsEvidenceKey: requestRow.rightsEvidenceKey,
          rightsVerifiedAt: decision === "approved" ? now : null,
          rightsVerifiedBy: decision === "approved" ? session.name : null,
        })
        .where(eq(books.id, createdBookId));
    }

    await env.DB.prepare(
      `UPDATE book_upload_requests
       SET status = ?, created_book_id = ?,
           updated_at = ?, last_decision_by = ?, last_decision_at = ?
       WHERE id = ?`,
    )
      .bind(decision, createdBookId ?? null, now, session.name, now, id)
      .run();

    await env.DB.prepare(
      `INSERT INTO request_decisions
        (request_type, request_id, decision, actor_id, actor_name, message, created_at)
       VALUES ('book', ?, ?, ?, ?, ?, ?)`,
    )
      .bind(String(id), decision, session.id, session.name, note, now)
      .run();

    const verb = decisionLabel(decision);
    await createNotification({
      userId: requestRow.userId,
      title:
        decision === "approved"
          ? `Tu propuesta “${requestRow.title}” fue aprobada`
          : `Tu propuesta “${requestRow.title}” fue rechazada`,
      body: `${session.name} ${verb} la petición de subir “${requestRow.title}”.${note ? ` Mensaje: ${note}` : ""}`,
      kind: "book-decision",
      createdById: session.id,
      createdByName: session.name,
    });

    return Response.json({
      ok: true,
      type,
      id,
      decision,
      actor: session.name,
      createdBookId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo guardar el dictamen.";
    return Response.json({ error: message }, { status: 500 });
  }
}
