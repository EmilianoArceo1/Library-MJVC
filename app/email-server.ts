import { env } from "cloudflare:workers";
import { ensureWorkflowSchema } from "./workflow-server";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GMAIL_SEND_ENDPOINT = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

type EmailRuntimeEnv = {
  GMAIL_CLIENT_ID?: string;
  GMAIL_CLIENT_SECRET?: string;
  GMAIL_REFRESH_TOKEN?: string;
  GMAIL_FROM?: string;
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
  const clientId = runtime.GMAIL_CLIENT_ID?.trim() ?? "";
  const clientSecret = runtime.GMAIL_CLIENT_SECRET?.trim() ?? "";
  const refreshToken = runtime.GMAIL_REFRESH_TOKEN?.trim() ?? "";
  const from =
    runtime.GMAIL_FROM?.trim() ||
    "Biblioteca Jornadas <biblioteca.jornadas@gmail.com>";
  const baseUrl = runtime.PUBLIC_APP_URL?.trim() || new URL(request.url).origin;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "La verificación por correo aún no está configurada. Faltan GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET o GMAIL_REFRESH_TOKEN.",
    );
  }

  return { clientId, clientSecret, refreshToken, from, baseUrl };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function utf8ToBase64(value: string): string {
  return bytesToBase64(new TextEncoder().encode(value));
}

function encodeHeader(value: string): string {
  return `=?UTF-8?B?${utf8ToBase64(value)}?=`;
}

async function getGmailAccessToken(input: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<string> {
  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      refresh_token: input.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const payload = (await response.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !payload.access_token) {
    throw new Error(
      `No se pudo autorizar Gmail.${payload.error_description ? ` ${payload.error_description}` : payload.error ? ` ${payload.error}` : ""}`,
    );
  }

  return payload.access_token;
}

function buildMimeMessage(input: {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}): string {
  const boundary = `mjvc-${crypto.randomUUID()}`;
  return [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${encodeHeader(input.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    utf8ToBase64(input.text),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    utf8ToBase64(input.html),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

export async function sendVerificationEmail(input: {
  request: Request;
  email: string;
  name: string;
  token: string;
}) {
  const { clientId, clientSecret, refreshToken, from, baseUrl } =
    emailConfig(input.request);
  const verificationUrl = new URL("/api/auth/verify-email", baseUrl);
  verificationUrl.searchParams.set("token", input.token);

  const safeName = escapeHtml(input.name);
  const safeUrl = escapeHtml(verificationUrl.toString());
  const subject = "Verifica tu correo · Biblioteca MJVC Mérida";
  const text = `Hola, ${input.name}. Verifica tu correo para continuar con tu solicitud de registro en Biblioteca MJVC Mérida: ${verificationUrl.toString()}\n\nEl enlace vence en 24 horas.`;
  const html = `
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
  `;

  const accessToken = await getGmailAccessToken({
    clientId,
    clientSecret,
    refreshToken,
  });
  const mime = buildMimeMessage({
    from,
    to: input.email,
    subject,
    text,
    html,
  });

  const response = await fetch(GMAIL_SEND_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      raw: bytesToBase64Url(new TextEncoder().encode(mime)),
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `No se pudo enviar el correo de verificación con Gmail.${detail ? ` ${detail.slice(0, 240)}` : ""}`,
    );
  }
}
