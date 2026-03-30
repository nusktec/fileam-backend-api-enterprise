-- AlterTable (table name is "User" in this project, not "users")
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "request_delete" BOOLEAN NOT NULL DEFAULT false;
