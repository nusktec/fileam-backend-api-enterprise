-- At most one active consultant connection per client (user_id).
-- Consultants can still have many clients (many rows per consultant_user_id).
-- If this fails, find duplicates: SELECT user_id, count(*) FROM consultant_connections WHERE status = 'active' GROUP BY user_id HAVING count(*) > 1;
CREATE UNIQUE INDEX IF NOT EXISTS "consultant_connections_one_active_per_client_idx"
ON "consultant_connections" ("user_id")
WHERE status = 'active';
