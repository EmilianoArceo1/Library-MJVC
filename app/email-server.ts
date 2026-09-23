import { env } from "cloudflare:workers";
import { ensureWorkflowSchema } from "./workflow-server";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const RESEND_ENDPOINT = "https://api.resend.com/emails";

type EmailRuntimeEnv = {
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  PUBLIC_APP_URL?: string;
};

function runtimeEnv(): EmailRuntimeEnv {
  return env as unknown as EmailRuntimeEnv;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export async function hashEmailVerificationToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return bytesToBase64Url(new Uint8Array(digest));
}

export async function createEmailVerificationToken(userId: string): Promise<{
  token: string;
  expiresAt: number;
}> {
  await ensureWorkflowSchema();

  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = bytesToBase64Url(bytes);
  const tokenHash = await hashEmailVerificationToken(token);
  const now = Date.now();
  const expiresAt = now + TOKEN_TTL_MS;

  await env.DB.prepare(
    "UPDATE email_verification_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL",
  )
    .bind(now, userId)
    .run();

  await env.DB.prepare(
    `INSERT INTO email_verification_tokens
      (token_hash, user_id, expires_at, created_at, used_at)
     VALUES (?, ?, ?, ?, NULL)`,
  )
    .bind(tokenHash, userId, expiresAt, now)
    .run();

  return { token, expiresAt };
}

export async function deleteEmailVerificationTokens(userId: string) {
  await ensureWorkflowSchema();
  await env.DB.prepare(
    "DELETE FROM email_verification_tokens WHERE user_id = ?",
  )
    .bind(userId)
    .run();
}

export async function canResendVerification(userId: string): Promise<boolean> {
  await ensureWorkflowSchema();
  const row = await env.DB.prepare(
    `SELECT created_at AS createdAt
     FROM email_verification_tokens
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT 1`,
  )
    .bind(userId)
    .first<{ createdAt: number }>();

  if (!row) return true;
  return Date.now() - Number(row.createdAt) >= 60_000;
}

function emailConfig(request: Request) {
  const runtime = runtimeEnv();
  const apiKey = runtime.RESEND_API_KEY?.trim() ?? "";
  const from = runtime.EMAIL_FROM?.trim() ?? "";
  const baseUrl = runtime.PUBLIC_APP_URL?.trim() || new URL(request.url).origin;

  if (!apiKey || !from) {
    throw new Error(
      "La verificación por correo aún no está configurada. Faltan RESEND_API_KEY o EMAIL_FROM.",
    );
  }

  return { apiKey, from, baseUrl };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendVerificationEmail(input: {
  request: Request;
  email: string;
  name: string;
  token: string;
}) {
  const { apiKey, from, baseUrl } = emailConfig(input.request);
  const verificationUrl = new URL("/api/auth/verify-email", baseUrl);
  verificationUrl.searchParams.set("token", input.token);

  const safeName = escapeHtml(input.name);
  const safeUrl = escapeHtml(verificationUrl.toString());

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to: [input.email],
      subject: "Verifica tu correo · Biblioteca MJVC Mérida",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:32px;color:#382b23">
          <p style="font-size:12px;letter-spacing:1.4px;color:#a06c3c;font-weight:700">BIBLIOTECA VIRTUAL MJVC MÉRIDA</p>
          <h1 style="font-family:Georgia,serif;font-size:30px;margin:8px 0 18px">Confirma tu correo</h1>
          <p>Hola, ${safeName}.</p>
          <p>Antes de enviar tu solicitud de registro al administrador y a los asesores, necesitamos comprobar que este correo realmente te pertenece.</p>
          <p style="margin:28px 0">
            <a href="${safeUrl}" style="display:inline-block;background:#6f3b22;color:white;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:700">Verificar mi correo</a>
          </p>
          <p style="font-size:13px;color:#76685d">Este enlace vence en 24 horas. Si tú no intentaste registrarte, puedes ignorar este mensaje.</p>
        </div>
      `,
      text: `Hola, ${input.name}. Verifica tu correo para continuar con tu solicitud de registro en Biblioteca MJVC Mérida: ${verificationUrl.toString()}\n\nEl enlace vence en 24 horas.`,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `No se pudo enviar el correo de verificación.${detail ? ` ${detail.slice(0, 240)}` : ""}`,
    );
  }
}
