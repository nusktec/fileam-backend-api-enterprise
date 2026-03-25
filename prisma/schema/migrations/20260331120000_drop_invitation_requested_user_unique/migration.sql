-- Allow multiple invitations per client (e.g. enterprise invite + client-initiated consultant request).
DROP INDEX IF EXISTS "invitations_requested_user_id_key";

CREATE INDEX IF NOT EXISTS "invitations_requested_user_id_idx" ON "invitations"("requested_user_id");
