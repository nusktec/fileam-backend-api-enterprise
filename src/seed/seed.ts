import dotenv from "dotenv";
// Load `.env` first (same source Prisma uses via prisma.config). Then `.env.dev` for any
// extra keys without replacing DATABASE_URL etc. — use override in .env.dev only if you
// intentionally shadow keys (DATABASE_URL duplicates then point at the same DB as migrate).
dotenv.config();
dotenv.config({ path: ".env.dev" });

import bcrypt from "bcryptjs";
import { prisma } from "../config/database";

const PERMISSIONS = ["invite-user", "manage-settings", "view-reports"];

export async function runSeed() {
  const adminRole = await prisma.role.upsert({
    where: { name: "admin" },
    create: { name: "admin" },
    update: {},
  });

  const superAdminRole = await prisma.role.upsert({
    where: { name: "super_admin" },
    create: { name: "super_admin" },
    update: {},
  });

  await prisma.role.upsert({
    where: { name: "business" },
    create: { name: "business" },
    update: {},
  });

  await prisma.role.upsert({
    where: { name: "user" },
    create: { name: "user" },
    update: {},
  });

  await prisma.role.upsert({
    where: { name: "waiter" },
    create: { name: "waiter" },
    update: {},
  });

  for (const name of PERMISSIONS) {
    let permission = await prisma.permission.findFirst({
      where: { name },
    });
    if (!permission) {
      permission = await prisma.permission.create({
        data: { name },
      });
    }
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: adminRole.id,
          permissionId: permission.id,
        },
      },
      create: {
        roleId: adminRole.id,
        permissionId: permission.id,
      },
      update: {},
    });
  }

  const password = await bcrypt.hash("123456", 10);

  const adminUser = await prisma.user.upsert({
    where: { email: "admin@menu.ng" },
    create: {
      email: "admin@menu.ng",
      password,
      firstName: "Super",
      lastName: "Admin",
      verified: true,
      onboardingComplete: true,
    },
    update: {},
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: adminUser.id,
        roleId: adminRole.id,
      },
    },
    create: { userId: adminUser.id, roleId: adminRole.id },
    update: {},
  });
  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: adminUser.id,
        roleId: superAdminRole.id,
      },
    },
    create: { userId: adminUser.id, roleId: superAdminRole.id },
    update: {},
  });

  const businessRole = await prisma.role.findUnique({
    where: { name: "business" },
  });
  if (businessRole) {
    const businessUser = await prisma.user.upsert({
      where: { email: "business@menu.ng" },
      create: {
        email: "business@menu.ng",
        password,
        firstName: "Business",
        lastName: "Owner",
        verified: true,
        onboardingComplete: true,
      },
      update: {},
    });
    await prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: businessUser.id,
          roleId: businessRole.id,
        },
      },
      create: { userId: businessUser.id, roleId: businessRole.id },
      update: {},
    });
  }

  const userRole = await prisma.role.findUnique({
    where: { name: "user" },
  });
  if (userRole) {
    const regularUser = await prisma.user.upsert({
      where: { email: "user@menu.ng" },
      create: {
        email: "user@menu.ng",
        password,
        firstName: "Regular",
        lastName: "User",
        verified: true,
        onboardingComplete: true,
      },
      update: {},
    });
    await prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: regularUser.id,
          roleId: userRole.id,
        },
      },
      create: { userId: regularUser.id, roleId: userRole.id },
      update: {},
    });
  }

  console.log("Seed completed!");
}

function hintIfDatabaseMissing(err: unknown): void {
  const text = `${err}`;
  const url = process.env.DATABASE_URL;
  if (!text.includes("does not exist") || !url?.includes("/")) return;
  let dbName: string | undefined;
  try {
    const u = new URL(url.replace(/^postgresql:/i, "http:"));
    dbName = u.pathname.replace(/^\//, "").split("?")[0] || undefined;
  } catch {
    return;
  }
  console.error(`
PostgreSQL reports the database "${dbName}" does not exist.
Create it, apply migrations, then seed again:

  createdb "${dbName}"     # local Postgres with peer/trust auth, or:

  psql -U postgres -h HOST -p PORT -d postgres \\
    -c "CREATE DATABASE \\"${dbName}\\";"

Then: npm run prisma:migrate:deploy && npm run seed
`);
}

if (require.main === module) {
  runSeed()
    .then(() => process.exit(0))
    .catch((err) => {
      hintIfDatabaseMissing(err);
      console.error("Seed failed:", err);
      process.exit(1);
    });
}
