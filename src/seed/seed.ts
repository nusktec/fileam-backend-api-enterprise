import dotenv from "dotenv";
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

if (require.main === module) {
  runSeed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Seed failed:", err);
      process.exit(1);
    });
}
