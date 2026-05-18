import bcrypt from "bcryptjs";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../config/database";
import { EmailVerificationService } from "./emailVerificationService";
import {
  generateOnboardingToken,
  verifyOnboardingToken,
  OnboardingTokenPayload,
} from "../utils/onboardingToken";
import {
  generateAccessToken,
  generateRefreshToken,
  saveRefreshToken,
} from "../utils/jwt";
import { authService } from "../mobile/services/authService";
import { signupEmailRejectionMessage } from "../utils/emailPolicy";

const ONBOARDING_VERIFICATION_TYPE = "onboarding_verification";

function shapeBusinessForResponse(business: {
  id: string;
  name: string;
  incomeType: string;
  taxObligationsUnderstoodAndAccepted: boolean;
  businessIdNumber: string | null;
  tin: string | null;
  streetAddress: string | null;
  stateOfResidence: string | null;
  primaryTaxOffice: string | null;
}) {
  return {
    id: business.id,
    name: business.name,
    incomeType: business.incomeType,
    taxObligationsUnderstoodAndAccepted:
      business.taxObligationsUnderstoodAndAccepted,
    businessIdNumber: business.businessIdNumber,
    tin: business.tin,
    streetAddress: business.streetAddress,
    stateOfResidence: business.stateOfResidence,
    primaryTaxOffice: business.primaryTaxOffice,
  };
}

export const onboardingService = {
  async stepEmail(email: string, firstName?: string, _invitationId?: string) {
    const plusRejected = signupEmailRejectionMessage(email);
    if (plusRejected) {
      return { success: false as const, message: plusRejected };
    }
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { verified: true, onboardingComplete: true, firstName: true },
    });
    if (existing?.onboardingComplete) {
      return {
        success: false as const,
        message: "You have already completed mobile onboarding. Use login to access your account.",
      };
    }
    if (existing?.verified) {
      return {
        success: false as const,
        message: "An account with this email already exists",
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
    const plusRejected = signupEmailRejectionMessage(email);
    if (plusRejected) {
      return { success: false as const, message: plusRejected };
    }
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { verified: true, onboardingComplete: true, firstName: true },
    });
    if (existing?.onboardingComplete) {
      return {
        success: false as const,
        message:
          "You have already completed mobile onboarding. Use login to access your account.",
      };
    }
    if (existing?.verified) {
      return {
        success: false as const,
        message: "An account with this email already exists",
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
    consultantUserId?: string,
  ) {
    const plusRejected = signupEmailRejectionMessage(email);
    if (plusRejected) {
      return { success: false as const, message: plusRejected };
    }
    const result = await EmailVerificationService.verifyOtp(email, code);
    if (!result.success)
      return { success: false as const, message: result.message };

    const normalizedEmail = email.trim().toLowerCase();
    if (invitationId) {
      const invitation = await prisma.invitation.findUnique({
        where: { id: invitationId },
        select: { invitedEmail: true },
      });
      if (invitation && invitation.invitedEmail.toLowerCase() !== normalizedEmail) {
        return {
          success: false as const,
          message: `This invitation was sent to ${invitation.invitedEmail}. Please use that email address to accept the invitation.`,
        };
      }
    }

    const payload: OnboardingTokenPayload = {
      email: normalizedEmail,
      ...(invitationId && { invitationId }),
      ...(consultantUserId && { consultantUserId }),
      acceptedInvitationIds: [],
    };
    const token = generateOnboardingToken(payload);
    return { success: true as const, data: { onboardingToken: token, email: normalizedEmail } };
  },

  async stepPassword(
    tokenPayload: OnboardingTokenPayload,
    password: string,
    firstName?: string,
    lastName?: string,
  ) {
    const { email } = tokenPayload;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing)
      return {
        success: false as const,
        message: "An account with this email already exists",
      };

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
        currentOnboardingStep: "tax_persona",
        userRoles: { create: { roleId: businessRole.id } },
      },
      include: { userRoles: { include: { role: true } } },
    });
    const userPayload = authService.buildAuthUserPayload(created);
    return {
      success: true as const,
      data: {
        user: userPayload,
        currentOnboardingStep: created.currentOnboardingStep ?? "tax_persona",
      },
    };
  },

  async getUserByEmail(email: string) {
    if (!email || typeof email !== "string") return null;
    return prisma.user.findUnique({
      where: { email },
      include: { businesses: true, userRoles: { include: { role: true } } },
    });
  },

  async getOrCreateBusinessForUser(userId: string, incomeType: string) {
    const existing = await prisma.business.findFirst({
      where: { userId },
    });
    if (existing) {
      await prisma.business.update({
        where: { id: existing.id },
        data: { incomeType },
      });
      return prisma.business.findUnique({ where: { id: existing.id } });
    }
    return prisma.business.create({
      data: { userId, name: "Pending", incomeType },
    });
  },

  async stepTaxPersona(
    tokenPayload: OnboardingTokenPayload,
    taxPersona: string,
    solopreneurRegistration?: string,
    employmentGrossSalaryMonthly?: number | null,
  ) {
    const user = await this.getUserByEmail(tokenPayload.email);
    if (!user)
      return {
        success: false as const,
        message: "User not found. Complete password step first.",
      };
    if (user.onboardingComplete) {
      return {
        success: false as const,
        message: "You have already completed mobile onboarding. Use login to access your account.",
      };
    }
    const {
      normalizeTaxPersona,
      normalizeSolopreneurRegistration,
      listTaxPersonasForOnboarding,
      listSolopreneurRegistrationsForOnboarding,
      buildTaxPersonaGuidancePayload,
    } = await import("../constants/taxPersona");

    const persona = normalizeTaxPersona(taxPersona);
    if (!persona) {
      return {
        success: false as const,
        message: `Invalid taxPersona. Use one of: ${listTaxPersonasForOnboarding().map((x) => x.code).join(", ")}.`,
      };
    }

    let regStored: string | null = null;
    if (persona === "SOLOPRENEUR") {
      const reg = normalizeSolopreneurRegistration(solopreneurRegistration);
      if (!reg) {
        return {
          success: false as const,
          message:
            "solopreneurRegistration is required when taxPersona is SOLOPRENEUR (NOT_REGISTERED | BUSINESS_NAME | LIMITED_COMPANY).",
        };
      }
      regStored = reg;
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        taxPersona: persona,
        solopreneurRegistration: regStored,
        currentOnboardingStep: "income_type",
        ...(employmentGrossSalaryMonthly !== undefined && {
          employmentGrossSalaryMonthly:
            employmentGrossSalaryMonthly === null
              ? null
              : new Decimal(employmentGrossSalaryMonthly),
        }),
      },
    });

    const preview = buildTaxPersonaGuidancePayload(persona, regStored);
    const salaryOut =
      updatedUser.employmentGrossSalaryMonthly != null
        ? Number(updatedUser.employmentGrossSalaryMonthly)
        : null;
    return {
      success: true as const,
      data: {
        taxPersona: persona,
        solopreneurRegistration: regStored,
        employmentGrossSalaryMonthly: salaryOut,
        taxGuidancePreview: preview,
        currentOnboardingStep:
          updatedUser.currentOnboardingStep ?? "income_type",
      },
    };
  },

  async stepIncomeType(
    tokenPayload: OnboardingTokenPayload,
    incomeType: string,
  ) {
    const user = await this.getUserByEmail(tokenPayload.email);
    if (!user)
      return {
        success: false as const,
        message: "User not found. Complete password step first.",
      };
    if (user.onboardingComplete) {
      return {
        success: false as const,
        message: "You have already completed mobile onboarding. Use login to access your account.",
      };
    }
    if (user.currentOnboardingStep === "tax_persona") {
      return {
        success: false as const,
        message:
          "Select your tax persona first (POST /api/v1/onboarding/step/tax-persona).",
      };
    }

    const business = await this.getOrCreateBusinessForUser(user.id, incomeType);
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { currentOnboardingStep: "tax_obligations" },
    });
    return {
      success: true as const,
      data: {
        business: business ? shapeBusinessForResponse(business) : null,
        currentOnboardingStep:
          updatedUser.currentOnboardingStep ?? "tax_obligations",
      },
    };
  },

  async stepTaxObligations(tokenPayload: OnboardingTokenPayload) {
    const user = await this.getUserByEmail(tokenPayload.email);
    if (!user) return { success: false as const, message: "User not found." };
    if (user.onboardingComplete) {
      return {
        success: false as const,
        message: "You have already completed mobile onboarding. Use login to access your account.",
      };
    }
    const business = await prisma.business.findFirst({
      where: { userId: user.id },
    });
    if (!business)
      return {
        success: false as const,
        message: "Business not found. Complete income-type step first.",
      };

    const updatedBusiness = await prisma.business.update({
      where: { id: business.id },
      data: { taxObligationsUnderstoodAndAccepted: true },
    });
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { currentOnboardingStep: "business_details" },
    });
    return {
      success: true as const,
      data: {
        business: shapeBusinessForResponse(updatedBusiness),
        currentOnboardingStep:
          updatedUser.currentOnboardingStep ?? "business_details",
      },
    };
  },

  async stepBusinessDetails(
    tokenPayload: OnboardingTokenPayload,
    data: {
      name: string;
      businessIdNumber?: string;
      tin?: string;
      streetAddress?: string;
      stateOfResidence?: string;
      primaryTaxOffice?: string;
    },
  ) {
    const user = await this.getUserByEmail(tokenPayload.email);
    if (!user) return { success: false as const, message: "User not found." };
    if (user.onboardingComplete) {
      return {
        success: false as const,
        message: "You have already completed mobile onboarding. Use login to access your account.",
      };
    }
    const business = await prisma.business.findFirst({
      where: { userId: user.id },
    });
    if (!business)
      return { success: false as const, message: "Business not found." };

    const updatedBusiness = await prisma.business.update({
      where: { id: business.id },
      data: {
        name: data.name,
        businessIdNumber: data.businessIdNumber ?? null,
        tin: data.tin ?? null,
        streetAddress: data.streetAddress ?? null,
        stateOfResidence: data.stateOfResidence ?? null,
        primaryTaxOffice: data.primaryTaxOffice ?? null,
      },
    });
    await prisma.user.update({
      where: { id: user.id },
      data: { currentOnboardingStep: "tax_jurisdiction" },
    });
    return {
      success: true as const,
      data: {
        business: shapeBusinessForResponse(updatedBusiness),
        currentOnboardingStep: "tax_jurisdiction",
      },
    };
  },

  async stepTaxJurisdiction(
    tokenPayload: OnboardingTokenPayload,
    data: { primaryTaxOffice?: string; stateOfResidence?: string },
  ) {
    const user = await this.getUserByEmail(tokenPayload.email);
    if (!user) return { success: false as const, message: "User not found." };
    if (user.onboardingComplete) {
      return {
        success: false as const,
        message: "You have already completed mobile onboarding. Use login to access your account.",
      };
    }
    const business = await prisma.business.findFirst({
      where: { userId: user.id },
    });
    if (!business)
      return { success: false as const, message: "Business not found." };

    const updatedBusiness = await prisma.business.update({
      where: { id: business.id },
      data: {
        ...(data.primaryTaxOffice != null && {
          primaryTaxOffice: data.primaryTaxOffice,
        }),
        ...(data.stateOfResidence != null && {
          stateOfResidence: data.stateOfResidence,
        }),
      },
    });
    await prisma.user.update({
      where: { id: user.id },
      data: { currentOnboardingStep: "consultant_terms" },
    });
    return {
      success: true as const,
      data: {
        business: shapeBusinessForResponse(updatedBusiness),
        currentOnboardingStep: "consultant_terms",
      },
    };
  },

  async stepConsultantTerms(tokenPayload: OnboardingTokenPayload) {
    const user = await this.getUserByEmail(tokenPayload.email);
    if (!user) return { success: false as const, message: "User not found." };
    if (user.onboardingComplete) {
      return {
        success: false as const,
        message: "You have already completed mobile onboarding. Use login to access your account.",
      };
    }
    const business = await prisma.business.findFirst({
      where: { userId: user.id },
    });
    if (!business)
      return { success: false as const, message: "Business not found." };

    const acceptedIds = tokenPayload.acceptedInvitationIds ?? [];
    const now = new Date();
    let linkedConsultant = false;

    for (const invitationId of acceptedIds) {
      if (linkedConsultant) break;
      const inv = await prisma.invitation.findUnique({
        where: { id: invitationId },
      });
      if (!inv || inv.status !== "pending") continue;

      const business = await prisma.business.findFirst({
        where: { userId: user.id },
      });
      const clientCompanyName =
        inv.invitedBusinessName?.trim() ||
        business?.name ||
        user.organizationName ||
        `${user.firstName} ${user.lastName}`.trim() ||
        user.email;

      await prisma.company.create({
        data: {
          name: clientCompanyName,
          ownerId: inv.consultantUserId,
          linkedUserId: user.id,
          managedByCompanyId: null,
        },
      });

      await prisma.consultantConnection.create({
        data: {
          consultantUserId: inv.consultantUserId,
          userId: user.id,
          invitationId: inv.id,
          acceptedAt: now,
          consultantTermsAccepted: true,
          status: "active",
        },
      });
      await prisma.invitation.update({
        where: { id: inv.id },
        data: { status: "accepted" },
      });
      linkedConsultant = true;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        onboardingComplete: true,
        currentOnboardingStep: "complete",
        onboardingCompletedAt: now,
      },
    });

    const fullUser = await this.getUserByEmail(user.email);
    if (!fullUser)
      return { success: false as const, message: "User not found." };

    const connections = await prisma.consultantConnection.findMany({
      where: { userId: fullUser.id },
      include: { consultant: true, invitation: true },
    });

    const accessToken = generateAccessToken(fullUser.id);
    const refreshToken = generateRefreshToken();
    await saveRefreshToken(fullUser.id, refreshToken);

    const userPayload = authService.buildAuthUserPayload(fullUser);
    const businessData = fullUser.businesses[0]
      ? {
          id: fullUser.businesses[0].id,
          name: fullUser.businesses[0].name,
          incomeType: fullUser.businesses[0].incomeType,
          taxObligationsUnderstoodAndAccepted:
            fullUser.businesses[0].taxObligationsUnderstoodAndAccepted,
          businessIdNumber: fullUser.businesses[0].businessIdNumber,
          tin: fullUser.businesses[0].tin,
          streetAddress: fullUser.businesses[0].streetAddress,
          stateOfResidence: fullUser.businesses[0].stateOfResidence,
          primaryTaxOffice: fullUser.businesses[0].primaryTaxOffice,
        }
      : null;

    const acceptedConsultantConnections = connections.map((c) => ({
      invitationId: c.invitationId,
      consultantUserId: c.consultantUserId,
      consultantName:
        `${c.consultant.firstName} ${c.consultant.lastName}`.trim() ||
        c.consultant.organizationName ||
        "Consultant",
      acceptedAt: c.acceptedAt,
      consultantTermsAccepted: c.consultantTermsAccepted,
      status: c.status,
    }));

    return {
      success: true as const,
      data: {
        user: userPayload,
        business: businessData,
        acceptedConsultantConnections,
        tokens: { accessToken, refreshToken },
      },
    };
  },

  async getOnboardingProfile(tokenPayload: OnboardingTokenPayload) {
    const user = await this.getUserByEmail(tokenPayload.email);
    if (!user) {
      const {
        listTaxPersonasForOnboarding,
        listSolopreneurRegistrationsForOnboarding,
      } = await import("../constants/taxPersona");
      return {
        success: true as const,
        data: {
          email: tokenPayload.email,
          currentOnboardingStep: "password",
          onboardingComplete: false,
          user: null,
          business: null,
          taxPersonaOptions: listTaxPersonasForOnboarding(),
          solopreneurRegistrationOptions:
            listSolopreneurRegistrationsForOnboarding(),
          taxPersonaGuidance: null,
        },
      };
    }
    const business = user.businesses[0] ?? null;
    const {
      listTaxPersonasForOnboarding,
      listSolopreneurRegistrationsForOnboarding,
      buildTaxPersonaGuidancePayload,
    } = await import("../constants/taxPersona");

    const profile = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      verified: user.verified,
      onboardingComplete: user.onboardingComplete,
      currentOnboardingStep: user.currentOnboardingStep ?? "tax_persona",
      taxPersona: user.taxPersona ?? null,
      solopreneurRegistration: user.solopreneurRegistration ?? null,
      employmentGrossSalaryMonthly:
        user.employmentGrossSalaryMonthly != null
          ? Number(user.employmentGrossSalaryMonthly)
          : null,
    };
    const businessData = business
      ? {
          id: business.id,
          name: business.name,
          incomeType: business.incomeType,
          taxObligationsUnderstoodAndAccepted:
            business.taxObligationsUnderstoodAndAccepted,
          businessIdNumber: business.businessIdNumber,
          tin: business.tin,
          streetAddress: business.streetAddress,
          stateOfResidence: business.stateOfResidence,
          primaryTaxOffice: business.primaryTaxOffice,
        }
      : null;
    const guidance = buildTaxPersonaGuidancePayload(
      user.taxPersona,
      user.solopreneurRegistration,
    );

    return {
      success: true as const,
      data: {
        email: user.email,
        currentOnboardingStep: user.currentOnboardingStep ?? "tax_persona",
        onboardingComplete: user.onboardingComplete,
        user: profile,
        business: businessData,
        taxPersonaOptions: listTaxPersonasForOnboarding(),
        solopreneurRegistrationOptions:
          listSolopreneurRegistrationsForOnboarding(),
        taxPersonaGuidance: guidance,
      },
    };
  },

  verifyOnboardingToken(token: string): OnboardingTokenPayload | null {
    try {
      return verifyOnboardingToken(token);
    } catch {
      return null;
    }
  },

  async verifyInviteCode(code: string) {
    const invitation = await prisma.invitation.findFirst({
      where: { code, status: "pending" },
      include: { consultantUser: true },
    });
    if (!invitation)
      return {
        success: false as const,
        message: "Invalid or expired invitation code",
      };
    if (new Date() > invitation.expiresAt)
      return { success: false as const, message: "Invitation has expired" };

    const consultantName =
      invitation.consultantUser
        ? `${invitation.consultantUser.firstName} ${invitation.consultantUser.lastName}`.trim() ||
          invitation.consultantUser.organizationName ||
          "Consultant"
        : "Consultant";

    return {
      success: true as const,
      data: {
        invitationId: invitation.id,
        consultantUserId: invitation.consultantUserId,
        consultantName,
        invitedEmail: invitation.invitedEmail,
        invitedBusinessName: invitation.invitedBusinessName,
      },
    };
  },

  async acceptRequest(
    currentPayload: OnboardingTokenPayload,
    invitationId: string,
  ) {
    const invitation = await prisma.invitation.findUnique({
      where: { id: invitationId },
    });
    if (!invitation || invitation.status !== "pending")
      return {
        success: false as const,
        message: "Invalid or expired invitation",
      };
    if (new Date() > invitation.expiresAt)
      return { success: false as const, message: "Invitation has expired" };
    const invitedEmailNorm = invitation.invitedEmail.toLowerCase();
    const payloadEmailNorm = (currentPayload.email ?? "").trim().toLowerCase();
    if (invitedEmailNorm !== payloadEmailNorm)
      return {
        success: false as const,
        message: `This invitation was sent to ${invitation.invitedEmail}. Please use that email address, or complete sign-up with that email first.`,
      };

    const accepted = currentPayload.acceptedInvitationIds ?? [];
    if (accepted.includes(invitationId))
      return {
        success: true as const,
        data: { onboardingToken: generateOnboardingToken(currentPayload) },
      };

    const updated: OnboardingTokenPayload = {
      ...currentPayload,
      acceptedInvitationIds: [...accepted, invitationId],
    };
    const newToken = generateOnboardingToken(updated);
    return { success: true as const, data: { onboardingToken: newToken } };
  },

  async rejectRequest(_payload: OnboardingTokenPayload, invitationId: string) {
    const result = await prisma.invitation.updateMany({
      where: { id: invitationId, status: "pending" },
      data: { status: "rejected" },
    });
    return {
      success: true as const,
      data: { rejected: true, invitationId, count: result.count },
    };
  },
};
