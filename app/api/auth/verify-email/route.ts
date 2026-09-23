import { env } from "cloudflare:workers";
import { createNotification, ensureWorkflowSchema } from "../../../workflow-server";
import { hashEmailVerificationToken } from "../../../email-server";

function redirectResult(request: Request, result: string) {
  const url = new URL("/", request.url);
  url.searchParams.set("emailVerification", result);
  return Response.redirect(url.toString(), 302);
}

export async function GET(request: Request) {
  try {
    await ensureWorkflowSchema();
    const url = new URL(request.url);
    const token = url.searchParams.get("token")?.trim() ?? "";
    if (!token) return redirectResult(request, "invalid");

    const tokenHash = await hashEmailVerificationToken(token);
    const row = await env.DB.prepare(
      `SELECT
        t.user_id AS userId,
        t.expires_at AS expiresAt,
        t.used_at AS usedAt,
        u.name,
        u.approval_status AS approvalStatus,
        u.email_verified_at AS emailVerifiedAt,
        a.email
       FROM email_verification_tokens t
       INNER JOIN users u ON u.id = t.user_id
       INNER JOIN auth_credentials a ON a.user_id = u.id
       WHERE t.token_hash = ?
       LIMIT 1`,
    )
      .bind(tokenHash)
      .first<{
        userId: string;
        expiresAt: number;
        usedAt: number | null;
        name: string;
        approvalStatus: string;
        emailVerifiedAt: number | null;
        email: string;
      }>();

    if (!row) return redirectResult(request, "invalid");
    if (row.usedAt !== null || row.emailVerifiedAt !== null) {
      return redirectResult(request, "success");
    }
    if (Number(row.expiresAt) < Date.now()) {
      return redirectResult(request, "expired");
    }

    const now = Date.now();
    await env.DB.prepare(
      "UPDATE email_verification_tokens SET used_at = ? WHERE token_hash = ?",
    )
      .bind(now, tokenHash)
      .run();
    await env.DB.prepare(
      "UPDATE users SET email_verified_at = ? WHERE id = ?",
    )
      .bind(now, row.userId)
      .run();

    if (row.approvalStatus === "pending") {
      await env.DB.prepare(
        `INSERT INTO account_requests
          (user_id, requester_name, requester_email, status, requested_at, updated_at)
         VALUES (?, ?, ?, 'pending', ?, ?)
         ON CONFLICT(user_id) DO NOTHING`,
      )
        .bind(row.userId, row.name, row.email, now, now)
        .run();

      await createNotification({
        userId: row.userId,
        title: "Correo verificado",
        body:
          "Tu correo quedó confirmado. Ahora sí enviamos tu solicitud de registro al administrador y a los asesores para revisión.",
        kind: "email-verified",
      });
    }

    return redirectResult(request, "success");
  } catch (error) {
    console.error("No se pudo verificar el correo", error);
    return redirectResult(request, "invalid");
  }
}
