import bcrypt from "bcryptjs";
import { prisma } from "../../config/database";
import { generateAdminAccessToken } from "../../utils/adminJwt";

export const adminAuthService = {
  async login(email: string, password: string) {
    const admin = await prisma.admin.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
    if (!admin || !admin.active) {
      return { success: false as const, message: "Invalid credentials" };
    }
    const match = await bcrypt.compare(password, admin.password);
    if (!match) {
      return { success: false as const, message: "Invalid credentials" };
    }
    await prisma.admin.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });
    const accessToken = generateAdminAccessToken(admin.id);
    return {
      success: true as const,
      data: {
        accessToken,
        admin: {
          id: admin.id,
          email: admin.email,
          firstName: admin.firstName,
          lastName: admin.lastName,
          role: admin.role,
        },
      },
    };
  },

  async getMe(adminId: string) {
    return prisma.admin.findUnique({
      where: { id: adminId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        active: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
  },
};
