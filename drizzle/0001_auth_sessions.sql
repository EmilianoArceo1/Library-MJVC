PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS auth_credentials (
  user_id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS auth_credentials_email_unique
ON auth_credentials(email);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx
ON auth_sessions(user_id);

CREATE INDEX IF NOT EXISTS auth_sessions_expires_at_idx
ON auth_sessions(expires_at);
