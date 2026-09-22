import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { authCredentials, authSessions, users } from "../db/schema";
import { ensureWorkflowSchema, type ApprovalStatus, type UserRole } from "./workflow-server";

const SESSION_COOKIE = "mjvc_session";
const SESSION_DAYS = 30;
const PASSWORD_ITERATIONS = 100_000;
const PASSWORD_PREFIX = `v1$${PASSWORD_ITERATIONS}$`;

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  approvalStatus: ApprovalStatus;
  description: string;
  pagesRead: number;
  photoUrl: string | null;
};

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return bytesToBase64Url(new Uint8Array(digest));
}

async function derivePassword(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    key,
    256,
  );

  return bytesToBase64Url(new Uint8Array(bits));
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}

function randomToken(bytes = 32): string {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return bytesToBase64Url(value);
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;

  for (const part of header.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name) return rawValue.join("=") || null;
  }

  return null;
}

function cookieSecurity(request: Request): string {
  try {
    return new URL(request.url).protocol === "https:" ? "; Secure" : "";
  } catch {
    return "; Secure";
  }
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function createPasswordRecord(password: string): Promise<{
  passwordHash: string;
  passwordSalt: string;
}> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const derived = await derivePassword(password, salt, PASSWORD_ITERATIONS);

  return {
    passwordHash: `${PASSWORD_PREFIX}${derived}`,
    passwordSalt: bytesToBase64Url(salt),
  };
}

export async function verifyPassword(
  password: string,
  storedHash: string,
  storedSalt: string,
): Promise<boolean> {
  const match = storedHash.match(/^v1\$(\d+)\$(.+)$/);
  if (!match) return false;

  const iterations = Number(match[1]);
  if (!Number.isSafeInteger(iterations) || iterations < 10_000) return false;

  const salt = base64UrlToBytes(storedSalt);
  const candidate = await derivePassword(password, salt, iterations);
  return safeEqual(candidate, match[2]);
}

export async function createSession(
  request: Request,
  userId: string,
): Promise<string> {
  const db = getDb();
  const token = randomToken();
  const id = await sha256(token);
  const now = Date.now();
  const expiresAt = now + SESSION_DAYS * 24 * 60 * 60 * 1000;

  await db.insert(authSessions).values({
    id,
    userId,
    createdAt: now,
    expiresAt,
  });

  return [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_DAYS * 24 * 60 * 60}`,
  ].join("; ") + cookieSecurity(request);
}

export function clearSessionCookie(request: Request): string {
  return [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ].join("; ") + cookieSecurity(request);
}

export async function destroySession(request: Request): Promise<void> {
  await ensureWorkflowSchema();
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return;

  const db = getDb();
  const id = await sha256(token);
  await db.delete(authSessions).where(eq(authSessions.id, id));
}

export async function getSessionUser(
  request: Request,
): Promise<SessionUser | null> {
  await ensureWorkflowSchema();
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;

  const db = getDb();
  const id = await sha256(token);
  const [row] = await db
    .select({
      sessionId: authSessions.id,
      expiresAt: authSessions.expiresAt,
      id: users.id,
      name: users.name,
      role: users.role,
      approvalStatus: users.approvalStatus,
      email: authCredentials.email,
      description: users.description,
      pagesRead: users.pagesRead,
      photoKey: users.photoKey,
    })
    .from(authSessions)
    .innerJoin(users, eq(authSessions.userId, users.id))
    .innerJoin(authCredentials, eq(authCredentials.userId, users.id))
    .where(eq(authSessions.id, id))
    .limit(1);

  if (!row) return null;

  if (row.expiresAt <= Date.now()) {
    await db.delete(authSessions).where(eq(authSessions.id, row.sessionId));
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role as UserRole,
    approvalStatus: row.approvalStatus as ApprovalStatus,
    description: row.description,
    pagesRead: row.pagesRead,
    photoUrl: row.photoKey
      ? `/api/profile/photo?userId=${encodeURIComponent(row.id)}&v=${encodeURIComponent(row.photoKey)}`
      : null,
  };
}

