ALTER TABLE `users` ADD COLUMN `approval_status` text DEFAULT 'approved' NOT NULL;
--> statement-breakpoint
CREATE TABLE `account_requests` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` text NOT NULL,
  `requester_name` text NOT NULL,
  `requester_email` text NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `requested_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `last_decision_by` text,
  `last_decision_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_requests_user_id_unique` ON `account_requests` (`user_id`);
--> statement-breakpoint
CREATE TABLE `book_upload_requests` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` text NOT NULL,
  `requester_name` text NOT NULL,
  `requester_email` text NOT NULL,
  `title` text NOT NULL,
  `author` text NOT NULL,
  `year` integer NOT NULL,
  `pages` integer NOT NULL,
  `synopsis` text NOT NULL,
  `type` text NOT NULL,
  `copies` integer DEFAULT 1 NOT NULL,
  `file_key` text NOT NULL,
  `original_name` text NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `created_book_id` integer,
  `requested_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `last_decision_by` text,
  `last_decision_at` integer
);
--> statement-breakpoint
CREATE TABLE `request_decisions` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `request_type` text NOT NULL,
  `request_id` text NOT NULL,
  `decision` text NOT NULL,
  `actor_id` text NOT NULL,
  `actor_name` text NOT NULL,
  `message` text DEFAULT '' NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notifications` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` text,
  `title` text NOT NULL,
  `body` text NOT NULL,
  `kind` text DEFAULT 'system' NOT NULL,
  `created_by_id` text,
  `created_by_name` text,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notification_reads` (
  `notification_id` integer NOT NULL,
  `user_id` text NOT NULL,
  `read_at` integer NOT NULL,
  PRIMARY KEY(`notification_id`, `user_id`)
);
