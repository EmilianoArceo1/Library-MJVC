import { env } from "cloudflare:workers";
import { getSessionUser } from "../../auth-server";
import { createNotification, ensureWorkflowSchema } from "../../workflow-server";

export async function GET(request: Request) {
  try {
    const session = await getSessionUser(request);
    if (!session) {
      return Response.json({ error: "Inicia sesión para ver tus notificaciones." }, { status: 401 });
    }

    await ensureWorkflowSchema();
    const result = await env.DB.prepare(
      `SELECT
        n.id,
        n.title,
        n.body,
        n.kind,
        n.created_by_name AS createdByName,
        n.created_at AS createdAt,
        CASE WHEN r.notification_id IS NULL THEN 0 ELSE 1 END AS isRead
       FROM notifications n
       LEFT JOIN notification_reads r
         ON r.notification_id = n.id AND r.user_id = ?
       WHERE n.user_id IS NULL OR n.user_id = ?
       ORDER BY n.created_at DESC
       LIMIT 150`,
    )
      .bind(session.id, session.id)
      .all<{
        id: number;
        title: string;
        body: string;
        kind: string;
        createdByName: string | null;
        createdAt: number;
        isRead: number;
      }>();

    const notifications = result.results.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      kind: row.kind,
      createdByName: row.createdByName,
      createdAt: row.createdAt,
      read: Boolean(row.isRead),
    }));

    return Response.json({
      notifications,
      unread: notifications.filter((item) => !item.read).length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudieron cargar las notificaciones.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getSessionUser(request);
    if (!session) {
      return Response.json({ error: "Inicia sesión." }, { status: 401 });
    }

    await ensureWorkflowSchema();
    const payload = (await request.json()) as { id?: number; all?: boolean };
    const now = Date.now();

    if (payload.all) {
      const visible = await env.DB.prepare(
        "SELECT id FROM notifications WHERE user_id IS NULL OR user_id = ?",
      )
        .bind(session.id)
        .all<{ id: number }>();

      for (const row of visible.results) {
        await env.DB.prepare(
          `INSERT INTO notification_reads (notification_id, user_id, read_at)
           VALUES (?, ?, ?)
           ON CONFLICT(notification_id, user_id) DO UPDATE SET read_at = excluded.read_at`,
        )
          .bind(row.id, session.id, now)
          .run();
      }
      return Response.json({ ok: true });
    }

    const id = Number(payload.id);
    if (!Number.isInteger(id) || id < 1) {
      return Response.json({ error: "Notificación inválida." }, { status: 400 });
    }

    const visible = await env.DB.prepare(
      "SELECT id FROM notifications WHERE id = ? AND (user_id IS NULL OR user_id = ?) LIMIT 1",
    )
      .bind(id, session.id)
      .first<{ id: number }>();

    if (!visible) {
      return Response.json({ error: "Notificación no encontrada." }, { status: 404 });
    }

    await env.DB.prepare(
      `INSERT INTO notification_reads (notification_id, user_id, read_at)
       VALUES (?, ?, ?)
       ON CONFLICT(notification_id, user_id) DO UPDATE SET read_at = excluded.read_at`,
    )
      .bind(id, session.id, now)
      .run();

    return Response.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo actualizar la notificación.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSessionUser(request);
    if (!session || session.role !== "admin" || session.approvalStatus !== "approved") {
      return Response.json(
        { error: "Solo un administrador aprobado puede enviar avisos generales." },
        { status: 403 },
      );
    }

    const payload = (await request.json()) as { title?: string; body?: string };
    const title = payload.title?.trim() ?? "";
    const body = payload.body?.trim() ?? "";

    if (!title || title.length > 120 || !body || body.length > 1200) {
      return Response.json(
        { error: "Escribe un título y un mensaje válidos." },
        { status: 400 },
      );
    }

    await createNotification({
      userId: null,
      title,
      body,
      kind: "broadcast",
      createdById: session.id,
      createdByName: session.name,
    });

    return Response.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo enviar el aviso.";
    return Response.json({ error: message }, { status: 500 });
  }
}
