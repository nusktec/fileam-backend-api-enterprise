-- AlterTable
ALTER TABLE "consultant_connections" ADD COLUMN IF NOT EXISTS "filing_authorization" BOOLEAN NOT NULL DEFAULT false;
