import { env } from "cloudflare:workers";
import { getSessionUser } from "../../../auth-server";
import { isRightsStatus, privateNoIndexHeaders } from "../../../rights-server";
import { ensureWorkflowSchema, isModerator } from "../../../workflow-server";

export async function PATCH(request: Request) {
  try {
    const session = await getSessionUser(request);
    if (
      !session ||
      !session.emailVerified ||
      session.approvalStatus !== "approved" ||
      !isModerator(session.role)
    ) {
      return Response.json(
        { error: "Solo administradores y asesores aprobados pueden revisar derechos de propuestas." },
        { status: 403 },
      );
    }
    await ensureWorkflowSchema();

    const payload = (await request.json()) as {
      id?: number;
      rightsStatus?: string;
      rightsHolder?: string;
      rightsSourceUrl?: string;
      rightsPermissionBy?: string;
      rightsNotes?: string;
    };

    const id = Number(payload.id);
    const status = payload.rightsStatus?.trim() ?? "";
    const holder = payload.rightsHolder?.trim().slice(0, 180) ?? "";
    const sourceUrl = payload.rightsSourceUrl?.trim().slice(0, 1000) ?? "";
    const permissionBy = payload.rightsPermissionBy?.trim().slice(0, 180) ?? "";
    const notes = payload.rightsNotes?.trim().slice(0, 2000) ?? "";

    if (!Number.isInteger(id) || id < 1 || !isRightsStatus(status)) {
      return Response.json({ error: "Datos de derechos inválidos." }, { status: 400 });
    }
    if (sourceUrl) {
      try {
        const url = new URL(sourceUrl);
        if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
      } catch {
        return Response.json({ error: "La URL de fuente no es válida." }, { status: 400 });
      }
    }
    if (status === "permission" && (!holder || !permissionBy)) {
      return Response.json(
        { error: "Indica titular y quién concedió el permiso." },
        { status: 400 },
      );
    }
    if (status === "rights_reserved" && !holder) {
      return Response.json(
        { error: "Para una obra con derechos reservados, indica al titular o responsable de los derechos." },
        { status: 400 },
      );
    }
    if (
      (status === "creative_commons" ||
        status === "official_source" ||
        status === "public_domain") &&
      !sourceUrl &&
      !notes
    ) {
      return Response.json(
        { error: "Añade una fuente o nota para comprobar los derechos." },
        { status: 400 },
      );
    }

    const row = await env.DB.prepare(
      "SELECT id, user_id AS userId, status FROM book_upload_requests WHERE id = ? LIMIT 1",
    )
      .bind(id)
      .first<{ id: number; userId: string; status: string }>();
    if (!row) return Response.json({ error: "Propuesta no encontrada." }, { status: 404 });
    if (row.userId === session.id) {
      return Response.json(
        { error: "No puedes revisar jurídicamente tu propia propuesta." },
        { status: 409 },
      );
    }

    await env.DB.prepare(
      `UPDATE book_upload_requests
       SET rights_status = ?, rights_holder = ?, rights_source_url = ?,
           rights_permission_by = ?, rights_notes = ?, updated_at = ?
       WHERE id = ?`,
    )
      .bind(status, holder, sourceUrl, permissionBy, notes, Date.now(), id)
      .run();

    const headers = privateNoIndexHeaders("application/json; charset=utf-8");
    return Response.json({
      ok: true,
      rights: {
        status,
        holder,
        sourceUrl,
        permissionBy,
        notes,
        reviewedBy: session.name,
      },
    }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudieron revisar los derechos.";
    return Response.json({ error: message }, { status: 500 });
  }
}
