import { env } from "cloudflare:workers";

let schemaReady: Promise<void> | null = null;

async function hasColumn(table: "users" | "books" | "book_upload_requests" | "loans", name: string): Promise<boolean> {
  const result = await env.DB.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  return result.results.some((column) => column.name === name);
}

async function buildWorkflowSchema() {
  if (!(await hasColumn("users", "approval_status"))) {
    try {
      await env.DB.prepare(
        "ALTER TABLE users ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'approved'",
      ).run();
    } catch (error) {
      if (!(await hasColumn("users", "approval_status"))) throw error;
    }
  }

  if (!(await hasColumn("books", "publication_status"))) {
    try {
      await env.DB.prepare(
        "ALTER TABLE books ADD COLUMN publication_status TEXT NOT NULL DEFAULT 'published'",
      ).run();
    } catch (error) {
      if (!(await hasColumn("books", "publication_status"))) throw error;
    }
  }

  const hadEmailVerificationColumn = await hasColumn("users", "email_verified_at");
  if (!hadEmailVerificationColumn) {
    try {
      await env.DB.prepare(
        "ALTER TABLE users ADD COLUMN email_verified_at INTEGER",
      ).run();
    } catch (error) {
      if (!(await hasColumn("users", "email_verified_at"))) throw error;
    }

    // Existing accounts predate email verification, so preserve their access.
    await env.DB.prepare(
      "UPDATE users SET email_verified_at = ? WHERE email_verified_at IS NULL",
    )
      .bind(Date.now())
      .run();
  }

  const bookRightsColumns: Array<[string, string]> = [
    ["rights_status", "TEXT NOT NULL DEFAULT 'review'"],
    ["rights_holder", "TEXT NOT NULL DEFAULT ''"],
    ["rights_source_url", "TEXT NOT NULL DEFAULT ''"],
    ["rights_permission_by", "TEXT NOT NULL DEFAULT ''"],
    ["rights_notes", "TEXT NOT NULL DEFAULT ''"],
    ["rights_evidence_key", "TEXT"],
    ["rights_verified_at", "INTEGER"],
    ["rights_verified_by", "TEXT"],
    ["reserved_internal_access", "INTEGER NOT NULL DEFAULT 0"],
  ];
  for (const [column, definition] of bookRightsColumns) {
    if (!(await hasColumn("books", column))) {
      try {
        await env.DB.prepare(`ALTER TABLE books ADD COLUMN ${column} ${definition}`).run();
      } catch (error) {
        if (!(await hasColumn("books", column))) throw error;
      }
    }
  }

  if (!(await hasColumn("loans", "stats_eligible"))) {
    try {
      await env.DB.prepare(
        "ALTER TABLE loans ADD COLUMN stats_eligible INTEGER NOT NULL DEFAULT 1",
      ).run();
    } catch (error) {
      if (!(await hasColumn("loans", "stats_eligible"))) throw error;
    }
  }

  const statements = [
    `CREATE TABLE IF NOT EXISTS account_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      user_id TEXT NOT NULL UNIQUE,
      requester_name TEXT NOT NULL,
      requester_email TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      requested_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_decision_by TEXT,
      last_decision_at INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS book_upload_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      user_id TEXT NOT NULL,
      requester_name TEXT NOT NULL,
      requester_email TEXT NOT NULL,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      year INTEGER NOT NULL,
      pages INTEGER NOT NULL,
      synopsis TEXT NOT NULL,
      type TEXT NOT NULL,
      copies INTEGER NOT NULL DEFAULT 1,
      file_key TEXT NOT NULL,
      original_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_book_id INTEGER,
      requested_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_decision_by TEXT,
      last_decision_at INTEGER,
      rights_status TEXT NOT NULL DEFAULT 'review',
      rights_holder TEXT NOT NULL DEFAULT '',
      rights_source_url TEXT NOT NULL DEFAULT '',
      rights_permission_by TEXT NOT NULL DEFAULT '',
      rights_notes TEXT NOT NULL DEFAULT '',
      rights_evidence_key TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS request_decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      request_type TEXT NOT NULL,
      request_id TEXT NOT NULL,
      decision TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      message TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      user_id TEXT,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'system',
      created_by_id TEXT,
      created_by_name TEXT,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS notification_reads (
      notification_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      read_at INTEGER NOT NULL,
      PRIMARY KEY (notification_id, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS copyright_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      book_id INTEGER NOT NULL,
      reporter_user_id TEXT NOT NULL,
      reporter_name TEXT NOT NULL,
      reporter_email TEXT NOT NULL,
      claimant_name TEXT NOT NULL,
      claimant_email TEXT NOT NULL,
      relationship TEXT NOT NULL,
      evidence_url TEXT NOT NULL DEFAULT '',
      details TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      resolution_note TEXT NOT NULL DEFAULT '',
      resolved_by TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS email_verification_tokens (
      token_hash TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      used_at INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS book_read_acknowledgements (
      user_id TEXT NOT NULL,
      book_id INTEGER NOT NULL,
      marked_at INTEGER NOT NULL,
      source TEXT NOT NULL DEFAULT 'external',
      PRIMARY KEY (user_id, book_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    )`,
    "CREATE INDEX IF NOT EXISTS idx_account_requests_status ON account_requests(status, requested_at)",
    "CREATE INDEX IF NOT EXISTS idx_book_requests_status ON book_upload_requests(status, requested_at)",
    "CREATE INDEX IF NOT EXISTS idx_request_decisions_subject ON request_decisions(request_type, request_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_copyright_reports_status ON copyright_reports(status, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_copyright_reports_book ON copyright_reports(book_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_email_verification_user ON email_verification_tokens(user_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_book_read_ack_book ON book_read_acknowledgements(book_id, marked_at)",
  ];

  for (const sql of statements) {
    await env.DB.prepare(sql).run();
  }

  const requestRightsColumns: Array<[string, string]> = [
    ["rights_status", "TEXT NOT NULL DEFAULT 'review'"],
    ["rights_holder", "TEXT NOT NULL DEFAULT ''"],
    ["rights_source_url", "TEXT NOT NULL DEFAULT ''"],
    ["rights_permission_by", "TEXT NOT NULL DEFAULT ''"],
    ["rights_notes", "TEXT NOT NULL DEFAULT ''"],
    ["rights_evidence_key", "TEXT"],
  ];
  for (const [column, definition] of requestRightsColumns) {
    if (!(await hasColumn("book_upload_requests", column))) {
      try {
        await env.DB.prepare(`ALTER TABLE book_upload_requests ADD COLUMN ${column} ${definition}`).run();
      } catch (error) {
        if (!(await hasColumn("book_upload_requests", column))) throw error;
      }
    }
  }

  await env.DB.prepare(
    "UPDATE books SET publication_status = 'hidden' WHERE rights_status = 'review'",
  ).run();
  await env.DB.prepare(
    "UPDATE books SET publication_status = 'published' WHERE rights_status = 'rights_reserved' AND rights_source_url <> ''",
  ).run();

  await env.DB.prepare(
    "UPDATE users SET approval_status = 'approved' WHERE approval_status IS NULL OR approval_status = ''",
  ).run();
}

export async function ensureWorkflowSchema() {
  if (!schemaReady) {
    schemaReady = buildWorkflowSchema().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}

export type ApprovalStatus = "pending" | "approved" | "rejected";
export type UserRole = "reader" | "advisor" | "admin";

export function isModerator(role: string): boolean {
  return role === "admin" || role === "advisor";
}

export function isApproved(status: string): boolean {
  return status === "approved";
}

export async function createNotification(input: {
  userId?: string | null;
  title: string;
  body: string;
  kind?: string;
  createdById?: string | null;
  createdByName?: string | null;
}) {
  await ensureWorkflowSchema();
  await env.DB.prepare(
    `INSERT INTO notifications
      (user_id, title, body, kind, created_by_id, created_by_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      input.userId ?? null,
      input.title,
      input.body,
      input.kind ?? "system",
      input.createdById ?? null,
      input.createdByName ?? null,
      Date.now(),
    )
    .run();
}
