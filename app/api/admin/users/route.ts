import { env } from "cloudflare:workers";
import { getSessionUser } from "../../../auth-server";
import { ensureWorkflowSchema } from "../../../workflow-server";

async function requireAdmin(request: Request) {
  const session = await getSessionUser(request);
  if (
    !session ||
    session.role !== "admin" ||
    session.approvalStatus !== "approved"
  ) {
    return null;
  }
  return session;
}

export async function GET(request: Request) {
  try {
    const session = await requireAdmin(request);
    if (!session) {
      return Response.json(
        { error: "Solo un administrador aprobado puede gestionar usuarios." },
        { status: 403 },
      );
    }

    await ensureWorkflowSchema();
    const rows = await env.DB.prepare(
      `SELECT
        u.id,
        u.name,
        u.description,
        u.role,
        u.approval_status AS approvalStatus,
        u.pages_read AS pagesRead,
        a.email
       FROM users u
       LEFT JOIN auth_credentials a ON a.user_id = u.id
       ORDER BY
         CASE u.role WHEN 'admin' THEN 0 WHEN 'advisor' THEN 1 ELSE 2 END,
         u.name COLLATE NOCASE`,
    ).all();

    return Response.json({ users: rows.results, currentUserId: session.id });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudieron cargar los usuarios.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireAdmin(request);
    if (!session) {
      return Response.json(
        { error: "Solo un administrador aprobado puede editar usuarios." },
        { status: 403 },
      );
    }

    await ensureWorkflowSchema();
    const payload = (await request.json()) as {
      id?: string;
      name?: string;
      email?: string;
      description?: string;
      role?: "reader" | "advisor" | "admin";
    };

    const id = payload.id?.trim() ?? "";
    const name = payload.name?.trim() ?? "";
    const email = payload.email?.trim().toLowerCase() ?? "";
    const description = payload.description?.trim() ?? "";
    const role = payload.role;

    if (!id || !name || name.length > 80) {
      return Response.json({ error: "Revisa el usuario y el nombre." }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return Response.json({ error: "El correo no es válido." }, { status: 400 });
    }
    if (description.length > 320) {
      return Response.json({ error: "La descripción es demasiado larga." }, { status: 400 });
    }
    if (role !== "reader" && role !== "advisor" && role !== "admin") {
      return Response.json({ error: "Rol inválido." }, { status: 400 });
    }
    if (id === session.id && role !== "admin") {
      return Response.json(
        { error: "No puedes quitarte a ti mismo el rol de administrador." },
        { status: 409 },
      );
    }

    const target = await env.DB.prepare(
      "SELECT id FROM users WHERE id = ? LIMIT 1",
    )
      .bind(id)
      .first();
    if (!target) {
      return Response.json({ error: "Usuario no encontrado." }, { status: 404 });
    }

    const duplicateEmail = await env.DB.prepare(
      "SELECT user_id AS userId FROM auth_credentials WHERE email = ? AND user_id <> ? LIMIT 1",
    )
      .bind(email, id)
      .first();
    if (duplicateEmail) {
      return Response.json(
        { error: "Ese correo ya pertenece a otra cuenta." },
        { status: 409 },
      );
    }

    await env.DB.prepare(
      "UPDATE users SET name = ?, description = ?, role = ? WHERE id = ?",
    )
      .bind(name, description, role, id)
      .run();
    await env.DB.prepare(
      "UPDATE auth_credentials SET email = ? WHERE user_id = ?",
    )
      .bind(email, id)
      .run();

    const updated = await env.DB.prepare(
      `SELECT
        u.id, u.name, u.description, u.role,
        u.approval_status AS approvalStatus,
        u.pages_read AS pagesRead, a.email
       FROM users u
       LEFT JOIN auth_credentials a ON a.user_id = u.id
       WHERE u.id = ? LIMIT 1`,
    )
      .bind(id)
      .first();

    return Response.json({ user: updated });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo editar el usuario.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await requireAdmin(request);
    if (!session) {
      return Response.json(
        { error: "Solo un administrador aprobado puede eliminar usuarios." },
        { status: 403 },
      );
    }

    await ensureWorkflowSchema();
    const url = new URL(request.url);
    const id = url.searchParams.get("id")?.trim() ?? "";
    if (!id) {
      return Response.json({ error: "Usuario inválido." }, { status: 400 });
    }
    if (id === session.id) {
      return Response.json(
        { error: "No puedes eliminar tu propia cuenta desde este panel." },
        { status: 409 },
      );
    }

    const target = await env.DB.prepare(
      "SELECT id, name FROM users WHERE id = ? LIMIT 1",
    )
      .bind(id)
      .first<{ id: string; name: string }>();
    if (!target) {
      return Response.json({ error: "Usuario no encontrado." }, { status: 404 });
    }

    const activeLoans = await env.DB.prepare(
      `SELECT book_id AS bookId, COUNT(*) AS amount
       FROM loans
       WHERE user_id = ? AND returned_at IS NULL
       GROUP BY book_id`,
    )
      .bind(id)
      .all<{ bookId: number; amount: number }>();

    const now = Date.now();
    const pendingRegistration = await env.DB.prepare(
      "SELECT id FROM account_requests WHERE user_id = ? AND status = 'pending' LIMIT 1",
    )
      .bind(id)
      .first<{ id: number }>();
    if (pendingRegistration) {
      await env.DB.prepare(
        `UPDATE account_requests
         SET status = 'rejected', updated_at = ?, last_decision_by = ?, last_decision_at = ?
         WHERE id = ?`,
      )
        .bind(now, session.name, now, pendingRegistration.id)
        .run();
      await env.DB.prepare(
        `INSERT INTO request_decisions
          (request_type, request_id, decision, actor_id, actor_name, message, created_at)
         VALUES ('registration', ?, 'rejected', ?, ?, 'Cuenta eliminada por el administrador.', ?)`,
      )
        .bind(String(pendingRegistration.id), session.id, session.name, now)
        .run();
    }

    const pendingBookRequests = await env.DB.prepare(
      "SELECT id FROM book_upload_requests WHERE user_id = ? AND status = 'pending'",
    )
      .bind(id)
      .all<{ id: number }>();
    for (const requestRow of pendingBookRequests.results) {
      await env.DB.prepare(
        `UPDATE book_upload_requests
         SET status = 'rejected', updated_at = ?, last_decision_by = ?, last_decision_at = ?
         WHERE id = ?`,
      )
        .bind(now, session.name, now, requestRow.id)
        .run();
      await env.DB.prepare(
        `INSERT INTO request_decisions
          (request_type, request_id, decision, actor_id, actor_name, message, created_at)
         VALUES ('book', ?, 'rejected', ?, ?, 'Solicitud cerrada al eliminar la cuenta.', ?)`,
      )
        .bind(String(requestRow.id), session.id, session.name, now)
        .run();
    }

    for (const row of activeLoans.results) {
      await env.DB.prepare(
        `UPDATE books
         SET available_copies = MIN(total_copies, available_copies + ?)
         WHERE id = ?`,
      )
        .bind(row.amount, row.bookId)
        .run();
    }

    const questionIds = await env.DB.prepare(
      "SELECT id FROM questions WHERE user_id = ?",
    )
      .bind(id)
      .all<{ id: number }>();

    for (const row of questionIds.results) {
      await env.DB.prepare("DELETE FROM answers WHERE question_id = ?")
        .bind(row.id)
        .run();
    }

    const loanIds = await env.DB.prepare(
      "SELECT id FROM loans WHERE user_id = ?",
    )
      .bind(id)
      .all<{ id: number }>();
    for (const row of loanIds.results) {
      await env.DB.prepare("DELETE FROM reading_milestones WHERE loan_id = ?")
        .bind(row.id)
        .run()
        .catch(() => undefined);
    }

    const cleanup = [
      ["DELETE FROM notification_reads WHERE user_id = ?", id],
      ["DELETE FROM notifications WHERE user_id = ?", id],
      ["DELETE FROM user_preferences WHERE user_id = ?", id],
      ["DELETE FROM reactions WHERE user_id = ?", id],
      ["DELETE FROM answers WHERE user_id = ?", id],
      ["DELETE FROM questions WHERE user_id = ?", id],
      ["DELETE FROM posts WHERE user_id = ?", id],
      ["DELETE FROM loans WHERE user_id = ?", id],
      ["DELETE FROM auth_sessions WHERE user_id = ?", id],
      ["DELETE FROM auth_credentials WHERE user_id = ?", id],
      ["DELETE FROM users WHERE id = ?", id],
    ] as const;

    const optionalCleanup = new Set([
      "DELETE FROM user_preferences WHERE user_id = ?",
    ]);
    for (const [sql, value] of cleanup) {
      try {
        await env.DB.prepare(sql).bind(value).run();
      } catch (error) {
        if (!optionalCleanup.has(sql)) throw error;
      }
    }

    return Response.json({ ok: true, id, name: target.name });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo eliminar el usuario.";
    return Response.json({ error: message }, { status: 500 });
  }
}
