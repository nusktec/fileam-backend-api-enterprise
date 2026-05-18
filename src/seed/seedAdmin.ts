import dotenv from "dotenv";
dotenv.config();
dotenv.config({ path: ".env.dev" });

import bcrypt from "bcryptjs";
import { prisma } from "../config/database";

const DEFAULT_EMAIL =
  process.env.ADMIN_SEED_EMAIL ?? "admin@fileam.app";
const DEFAULT_PASSWORD =
  process.env.ADMIN_SEED_PASSWORD ?? "FileamAdmin123!";
const DEFAULT_FIRST = process.env.ADMIN_SEED_FIRST_NAME ?? "Platform";
const DEFAULT_LAST = process.env.ADMIN_SEED_LAST_NAME ?? "Admin";

export async function runAdminSeed() {
  const password = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  const admin = await prisma.admin.upsert({
    where: { email: DEFAULT_EMAIL.toLowerCase() },
    create: {
      email: DEFAULT_EMAIL.toLowerCase(),
      password,
      firstName: DEFAULT_FIRST,
      lastName: DEFAULT_LAST,
      role: "super_admin",
      active: true,
    },
    update: {
      password,
      firstName: DEFAULT_FIRST,
      lastName: DEFAULT_LAST,
      role: "super_admin",
      active: true,
    },
  });

  console.log("Admin seed completed.");
  console.log(`  Email:    ${admin.email}`);
  console.log(`  Password: ${DEFAULT_PASSWORD} (change after first login)`);
  return admin;
}

if (require.main === module) {
  runAdminSeed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Admin seed failed:", err);
      process.exit(1);
    });
}
