import bcrypt from "bcryptjs";
import { prisma } from "../../config/database";
import { EmailVerificationService } from "../../services/emailVerificationService";

const REFRESH_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

export interface AuthUserPayload {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  verified: boolean;
  organizationName?: string | null;
  organizationAddress?: string | null;
  logo?: string | null;
  role?: { id: string; name: string } | null;
}

export const authService = {
  async findUserByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
      include: { userRoles: { include: { role: true } } },
    });
  },

  async registerBusiness(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }) {
    const existing = await prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existing)
      return { success: false as const, message: "Email already exists" };

    const [businessRole] = await Promise.all([
      prisma.role.upsert({
        where: { name: "business" },
        create: { name: "business" },
        update: {},
      }),
    ]);

    const hashedPassword = await bcrypt.hash(data.password, 10);
    const user = await prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        firstName: data.firstName,
        lastName: data.lastName,
        userRoles: { create: { roleId: businessRole.id } },
      },
    });

    const verificationResult =
      await EmailVerificationService.generateAndSendVerification(
        data.email,
        data.firstName,
        "business_verification",
      );

    if (!verificationResult.success) {
      await prisma.user.delete({ where: { id: user.id } });
      return {
        success: false as const,
        message:
          "Account created but failed to send verification email. Please contact support.",
      };
    }

    return {
      success: true as const,
      data: {
        email: data.email,
        message: "Verification email sent successfully",
      },
    };
  },

  async registerUser(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    organizationName?: string;
    organizationAddress?: string;
    logo?: string;
  }) {
    const existing = await prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existing)
      return { success: false as const, message: "Email already exists" };

    const [userRole] = await Promise.all([
      prisma.role.upsert({
        where: { name: "user" },
        create: { name: "user" },
        update: {},
      }),
    ]);

    const hashedPassword = await bcrypt.hash(data.password, 10);
    const user = await prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        firstName: data.firstName,
        lastName: data.lastName,
        organizationName: data.organizationName,
        organizationAddress: data.organizationAddress,
        logo: data.logo,
        userRoles: { create: { roleId: userRole.id } },
      },
    });

    const verificationResult =
      await EmailVerificationService.generateAndSendVerification(
        data.email,
        data.firstName,
        "user_verification",
      );

    if (!verificationResult.success) {
      await prisma.user.delete({ where: { id: user.id } });
      return {
        success: false as const,
        message:
          "Account created but failed to send verification email. Please contact support.",
      };
    }

    return {
      success: true as const,
      data: {
        email: data.email,
        message: "Verification email sent successfully",
      },
    };
  },

  async validatePassword(plainPassword: string, hashedPassword: string) {
    return bcrypt.compare(plainPassword, hashedPassword);
  },

  async getUserWithRoles(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: { include: { role: true } },
      },
    });
  },

  buildAuthUserPayload(user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    verified: boolean;
    organizationName?: string | null;
    organizationAddress?: string | null;
    logo?: string | null;
    userRoles?: Array<{ role: { id: string; name: string } }>;
  }): AuthUserPayload {
    const primaryRole = user.userRoles?.[0]?.role;
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      verified: user.verified,
      organizationName: user.organizationName,
      organizationAddress: user.organizationAddress,
      logo: user.logo,
      role: primaryRole ? { id: primaryRole.id, name: primaryRole.name } : null,
    };
  },

  async saveRefreshToken(
    userId: string,
    token: string,
    expiresIn = REFRESH_TOKEN_EXPIRY_MS,
  ) {
    const expiresAt = new Date(Date.now() + expiresIn);
    await prisma.token.create({
      data: { userId, token, type: "refresh", expiresAt },
    });
  },

  async findValidRefreshToken(token: string) {
    return prisma.token.findFirst({
      where: {
        token,
        type: "refresh",
        expiresAt: { gt: new Date() },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            verified: true,
            organizationName: true,
            organizationAddress: true,
            logo: true,
            onboardingComplete: true,
            currentOnboardingStep: true,
            enterpriseOnboardingComplete: true,
            enterpriseOnboardingStep: true,
            userRoles: { include: { role: true } },
          },
        },
      },
    });
  },

  async findRefreshTokenRecord(token: string) {
    return prisma.token.findFirst({
      where: { token, type: "refresh" },
      select: { userId: true },
    });
  },

  async revokeRefreshToken(token: string, userId: string) {
    await prisma.token.deleteMany({
      where: { token, userId, type: "refresh" },
    });
  },

  async setUserVerified(email: string) {
    await prisma.user.update({
      where: { email },
      data: { verified: true },
    });
  },

  async updatePasswordByEmail(email: string, newPassword: string) {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { email },
      data: { password: hashedPassword },
    });
  },
};
