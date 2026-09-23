import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  photoKey: text("photo_key"),
  role: text("role", { enum: ["reader", "advisor", "admin"] }).notNull().default("reader"),
  approvalStatus: text("approval_status", { enum: ["pending", "approved", "rejected"] }).notNull().default("approved"),
  emailVerifiedAt: integer("email_verified_at"),
  pagesRead: integer("pages_read").notNull().default(0),
});

export const userPreferences = sqliteTable("user_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  theme: text("theme", { enum: ["light", "dark"] }).notNull().default("light"),
});

export const authCredentials = sqliteTable("auth_credentials", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
});

export const authSessions = sqliteTable("auth_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const books = sqliteTable("books", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  author: text("author").notNull(),
  year: integer("year").notNull(),
  pages: integer("pages").notNull(),
  synopsis: text("synopsis").notNull(),
  type: text("type").notNull(),
  totalCopies: integer("total_copies").notNull().default(1),
  availableCopies: integer("available_copies").notNull().default(1),
  fileKey: text("file_key"),
  coverKey: text("cover_key"),
  rating: real("rating").notNull().default(0),
  publicationStatus: text("publication_status", { enum: ["published", "hidden"] }).notNull().default("published"),
  rightsStatus: text("rights_status", { enum: ["own_work", "public_domain", "creative_commons", "permission", "rights_reserved", "official_source", "review"] }).notNull().default("review"),
  rightsHolder: text("rights_holder").notNull().default(""),
  rightsSourceUrl: text("rights_source_url").notNull().default(""),
  rightsPermissionBy: text("rights_permission_by").notNull().default(""),
  rightsNotes: text("rights_notes").notNull().default(""),
  rightsEvidenceKey: text("rights_evidence_key"),
  rightsVerifiedAt: integer("rights_verified_at"),
  rightsVerifiedBy: text("rights_verified_by"),
});

export const loans = sqliteTable("loans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bookId: integer("book_id").notNull().references(() => books.id),
  userId: text("user_id").notNull().references(() => users.id),
  borrowedAt: integer("borrowed_at", { mode: "timestamp" }).notNull(),
  returnedAt: integer("returned_at", { mode: "timestamp" }),
  rating: integer("rating"),
  progress: integer("progress").notNull().default(0),
});

export const questions = sqliteTable("questions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bookId: integer("book_id").notNull().references(() => books.id),
  userId: text("user_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const answers = sqliteTable("answers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  questionId: integer("question_id").notNull().references(() => questions.id),
  userId: text("user_id").notNull().references(() => users.id),
  body: text("body").notNull(),
});

export const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bookId: integer("book_id").references(() => books.id),
  userId: text("user_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const reactions = sqliteTable("reactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull().references(() => users.id),
  targetType: text("target_type", { enum: ["post", "profile"] }).notNull(),
  targetId: text("target_id").notNull(),
  emoji: text("emoji").notNull(),
});
