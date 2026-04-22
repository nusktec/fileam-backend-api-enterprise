/**
 * Prisma stores a SHA-256 (hex) of migration.sql in _prisma_migrations.
 * If you changed a file after it was applied, `migrate deploy` fails with
 * a checksum error — run this, apply the printed UPDATE, then deploy again.
 *
 *   node scripts/print-migration-checksum.cjs 20260312105438_add_invitation_and_connection_status_enums
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const name =
  process.argv[2] ||
  "20260312105438_add_invitation_and_connection_status_enums";
const sqlPath = path.join(
  __dirname,
  "..",
  "prisma",
  "schema",
  "migrations",
  name,
  "migration.sql",
);
if (!fs.existsSync(sqlPath)) {
  console.error("File not found:", sqlPath);
  process.exit(1);
}
const buf = fs.readFileSync(sqlPath, "utf8");
const hash = crypto.createHash("sha256").update(buf, "utf8").digest("hex");
console.log("migration_name:", name);
console.log("checksum (sha256 hex):", hash);
console.log();
console.log(
  `UPDATE "_prisma_migrations" SET "checksum" = '${hash}' WHERE "migration_name" = '${name}';`,
);
console.log();
console.log("Run the UPDATE in psql/Adminer, then: npm run prisma:migrate:deploy");
