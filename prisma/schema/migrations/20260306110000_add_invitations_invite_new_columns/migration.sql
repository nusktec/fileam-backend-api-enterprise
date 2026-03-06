-- Add Invite New fields to invitations (idempotent).
-- Use when the 20260302000000 migration was marked applied but these columns were never created.

ALTER TABLE "invitations" ADD COLUMN IF NOT EXISTS "invited_contact_name" TEXT;
ALTER TABLE "invitations" ADD COLUMN IF NOT EXISTS "invited_rc_number" TEXT;
ALTER TABLE "invitations" ADD COLUMN IF NOT EXISTS "invited_phone" TEXT;
ALTER TABLE "invitations" ADD COLUMN IF NOT EXISTS "state_of_operation" TEXT;
ALTER TABLE "invitations" ADD COLUMN IF NOT EXISTS "tax_types_managed" TEXT;
