import bcrypt from "bcryptjs";
import { prisma } from "../../config/database";

export const userService = {
  async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        verified: true,
        address: true,
        state: true,
        lga: true,
        purpose: true,
        roleDescription: true,
        teamSize: true,
        adminCount: true,
        organizationName: true,
        organizationAddress: true,
        logo: true,
        onboardingComplete: true,
        createdAt: true,
        updatedAt: true,
        userRoles: { include: { role: { select: { id: true, name: true } } } },
      },
    });
    if (!user) return null;
    const primaryRole = user.userRoles?.[0]?.role;
    return {
      ...user,
      role: primaryRole ?? null,
      userRoles: undefined,
    };
  },

  async updateProfile(
    userId: string,
    data: {
      firstName?: string;
      lastName?: string;
      address?: string;
      state?: string;
      lga?: string;
      purpose?: string;
      roleDescription?: string;
      teamSize?: number;
      adminCount?: number;
      organizationName?: string;
      organizationAddress?: string;
      logo?: string;
    }
  ) {
    return prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.firstName !== undefined && { firstName: data.firstName }),
        ...(data.lastName !== undefined && { lastName: data.lastName }),
        ...(data.address !== undefined && { address: data.address }),
        ...(data.state !== undefined && { state: data.state }),
        ...(data.lga !== undefined && { lga: data.lga }),
        ...(data.purpose !== undefined && { purpose: data.purpose }),
        ...(data.roleDescription !== undefined && { roleDescription: data.roleDescription }),
        ...(data.teamSize !== undefined && { teamSize: data.teamSize }),
        ...(data.adminCount !== undefined && { adminCount: data.adminCount }),
        ...(data.organizationName !== undefined && { organizationName: data.organizationName }),
        ...(data.organizationAddress !== undefined && {
          organizationAddress: data.organizationAddress,
        }),
        ...(data.logo !== undefined && { logo: data.logo }),
      },
      include: {
        userRoles: { include: { role: { select: { id: true, name: true } } } },
      },
    });
  },

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { password: true },
    });
    if (!user) return { success: false as const, message: "User not found" };
    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) return { success: false as const, message: "Current password is incorrect" };
    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashed },
    });
    return { success: true as const };
  },
};
