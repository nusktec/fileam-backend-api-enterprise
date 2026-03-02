import bcrypt from "bcryptjs";
import { prisma } from "../config/database";
import { EmailVerificationService } from "./emailVerificationService";
import { consultantOnboardingService } from "../enterprise/services/consultantOnboardingService";
import {
  generateOnboardingToken,
  OnboardingTokenPayload,
} from "../utils/onboardingToken";
import {
  generateAccessToken,
  generateRefreshToken,
  saveRefreshToken,
} from "../utils/jwt";
import { authService } from "../mobile/services/authService";

const ONBOARDING_VERIFICATION_TYPE = "onboarding_verification";
const ACCOUNT_VERIFICATION_TYPE = "account_verification";

const ENTERPRISE_FIRST_STEP = "company_creation";

export const enterpriseOnboardingService = {
  async stepEmail(email: string, firstName?: string) {
    const existing = (await prisma.user.findUnique({
      where: { email },
    })) as { firstName: string; enterpriseOnboardingComplete?: boolean } | null;
    if (existing?.enterpriseOnboardingComplete) {
      return {
        success: false as const,
        message:
          "You have already completed enterprise onboarding. Use login to access your account.",
      };
    }
    const name = firstName ?? existing?.firstName ?? "User";
    const result = await EmailVerificationService.generateAndSendVerification(
      email,
      name,
      ONBOARDING_VERIFICATION_TYPE,
    );
    if (!result.success)
      return { success: false as const, message: result.message };
    return { success: true as const, data: { email } };
  },

  async resendStepEmail(email: string, firstName?: string) {
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { firstName: true, enterpriseOnboardingComplete: true },
    });
    if (
      (existing as { enterpriseOnboardingComplete?: boolean } | null)
        ?.enterpriseOnboardingComplete
    ) {
      return {
        success: false as const,
        message:
          "You have already completed enterprise onboarding. Use login to access your account.",
      };
    }
    const name = firstName ?? existing?.firstName ?? "User";
    const result = await EmailVerificationService.resendVerification(
      email,
      name,
      ONBOARDING_VERIFICATION_TYPE,
    );
    if (!result.success)
      return { success: false as const, message: result.message };
    return { success: true as const, data: { email } };
  },

  async stepEmailVerify(
    email: string,
    code: string,
    invitationId?: string,
    companyId?: string,
  ) {
    const result = await EmailVerificationService.verifyOtp(email, code);
    if (!result.success)
      return { success: false as const, message: result.message };

    const user = await prisma.user.findUnique({
      where: { email },
      include: { userRoles: { include: { role: true } } },
    });

    if (user) {
      if (user.verified) {
        await consultantOnboardingService.ensureConsultantSessionForUser(user.id);
        const payload: OnboardingTokenPayload = {
          email,
          ...(invitationId && { invitationId }),
          ...(companyId && { companyId }),
          acceptedInvitationIds: [],
        };
        const token = generateOnboardingToken(payload);
        return {
          success: true as const,
          data: {
            onboardingToken: token,
            email,
            alreadyVerified: true,
            message: "Use step/password with your existing password to link your account.",
          },
        };
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          verified: true,
          enterpriseOnboardingStep: ENTERPRISE_FIRST_STEP,
        } as { verified: boolean; enterpriseOnboardingStep: string },
      });
      await consultantOnboardingService.ensureConsultantSessionForUser(user.id);

      const updated = await prisma.user.findUnique({
        where: { id: user.id },
        include: { userRoles: { include: { role: true } } },
      });
      if (!updated)
        return { success: false as const, message: "User not found." };

      const accessToken = generateAccessToken(updated.id);
      const refreshToken = generateRefreshToken();
      await saveRefreshToken(updated.id, refreshToken);
      const userPayload = authService.buildAuthUserPayload(updated);

      return {
        success: true as const,
        data: {
          user: userPayload,
          accessToken,
          refreshToken,
          enterpriseOnboardingStep: ENTERPRISE_FIRST_STEP,
          enterpriseOnboardingComplete: false,
        },
      };
    }

    const payload: OnboardingTokenPayload = {
      email,
      ...(invitationId && { invitationId }),
      ...(companyId && { companyId }),
      acceptedInvitationIds: [],
    };
    const token = generateOnboardingToken(payload);
    return { success: true as const, data: { onboardingToken: token, email } };
  },

  async stepPassword(
    tokenPayload: OnboardingTokenPayload,
    password: string,
    firstName?: string,
    lastName?: string,
  ) {
    const { email } = tokenPayload;
    const existing = await prisma.user.findUnique({
      where: { email },
      include: { userRoles: { include: { role: true } } },
    });

    if (existing) {
      if (
        (existing as { enterpriseOnboardingComplete?: boolean })
          .enterpriseOnboardingComplete
      ) {
        return {
          success: false as const,
          message:
            "You have already completed enterprise onboarding. Use login to access your account.",
        };
      }
      const match = await bcrypt.compare(password, existing.password);
      if (!match)
        return {
          success: false as const,
          message: "Invalid password. Use the password for this account.",
        };

      const accessToken = generateAccessToken(existing.id);
      const refreshToken = generateRefreshToken();
      await saveRefreshToken(existing.id, refreshToken);
      const userPayload = authService.buildAuthUserPayload(existing);

      return {
        success: true as const,
        data: {
          user: userPayload,
          accessToken,
          refreshToken,
          existingAccountLinked: true,
          enterpriseOnboardingStep: ENTERPRISE_FIRST_STEP,
          enterpriseOnboardingComplete:
            (existing as { enterpriseOnboardingComplete?: boolean })
              .enterpriseOnboardingComplete ?? false,
        },
      };
    }

    const [businessRole] = await Promise.all([
      prisma.role.upsert({
        where: { name: "business" },
        create: { name: "business" },
        update: {},
      }),
    ]);

    const hashedPassword = await bcrypt.hash(password, 10);
    const created = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName: firstName?.trim() || "User",
        lastName: lastName?.trim() || "",
        verified: true,
        enterpriseOnboardingStep: ENTERPRISE_FIRST_STEP,
        enterpriseOnboardingComplete: false,
        userRoles: { create: { roleId: businessRole.id } },
      } as {
        email: string;
        password: string;
        firstName: string;
        lastName: string;
        verified: boolean;
        enterpriseOnboardingStep: string;
        enterpriseOnboardingComplete: boolean;
        userRoles: { create: { roleId: string } };
      },
      include: { userRoles: { include: { role: true } } },
    });
    await consultantOnboardingService.ensureConsultantSessionForUser(created.id);

    const accessToken = generateAccessToken(created.id);
    const refreshToken = generateRefreshToken();
    await saveRefreshToken(created.id, refreshToken);
    const userPayload = authService.buildAuthUserPayload(created);

    return {
      success: true as const,
      data: {
        user: userPayload,
        accessToken,
        refreshToken,
        enterpriseOnboardingStep: ENTERPRISE_FIRST_STEP,
        enterpriseOnboardingComplete: false,
      },
    };
  },

};
