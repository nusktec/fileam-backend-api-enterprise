-- Destroys every object in public (including _prisma_migrations).
-- After this, run: npx prisma migrate deploy --schema=prisma/schema
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO CURRENT_USER;
GRANT ALL ON SCHEMA public TO public;
