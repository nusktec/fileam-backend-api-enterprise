import bcrypt from "bcryptjs";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import {
  normalizeSolopreneurRegistration,
  normalizeTaxPersona,
} from "../../constants/taxPersona";
import {
  businessProfileMoneyToNumber,
  decimalFromBusinessProfileMoney,
  normalizeBusinessProfileSector,
} from "../../constants/businessProfile";
import { buildTaxEligibilityProfileForUser } from "./taxEligibilityService";
import {
  normalizePrimaryBusinessActivity,
  normalizeProvidesProfessionalServices,
  providesProfessionalServicesAnswerToBoolean,
  type PrimaryBusinessActivity,
  type ProvidesProfessionalServicesAnswer,
} from "../../constants/taxEligibility";
import { HttpReplyError } from "../../utils/httpReplyError";

type BusinessWithExtras = {
  rcNumber?: string | null;
  businessType?: string | null;
  sector?: string | null;
  totalFixedAssets?: Decimal | null;
  annualGrossTurnover?: Decimal | null;
  providesProfessionalServices?: string | null;
  primaryBusinessActivity?: string | null;
  bankAccount?: string | null;
  name?: string;
  tin?: string | null;
  stateOfResidence?: string | null;
  streetAddress?: string | null;
};
type UserWithNotificationPrefs = {
  filingRemindersEnabled?: boolean;
  payersNotificationsEnabled?: boolean;
  complianceUpdatesEnabled?: boolean;
  twoFactorEnabled?: boolean;
  taxDeadlineEnabled?: boolean;
  filingConfirmationsEnabled?: boolean;
  weeklySummaryEnabled?: boolean;
};
type ConsultantConnWithExtras = {
  managingTaxForms?: string | null;
  consultantDisplayName?: string | null;
};

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
        taxPersona: true,
        solopreneurRegistration: true,
        employmentGrossSalaryMonthly: true,
        createdAt: true,
        updatedAt: true,
        userRoles: { include: { role: { select: { id: true, name: true } } } },
      },
    });
    if (!user) return null;
    const primaryRole = user.userRoles?.[0]?.role;
    const { employmentGrossSalaryMonthly, ...rest } = user;
    return {
      ...rest,
      employmentGrossSalaryMonthly:
        employmentGrossSalaryMonthly != null
          ? Number(employmentGrossSalaryMonthly)
          : null,
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
      taxPersona?: string | null;
      solopreneurRegistration?: string | null;
      employmentGrossSalaryMonthly?: number | null;
    },
  ) {
    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { taxPersona: true, solopreneurRegistration: true },
    });

    const personaPatch =
      data.taxPersona !== undefined
        ? normalizeTaxPersona(
            data.taxPersona === null || data.taxPersona === ""
              ? undefined
              : data.taxPersona,
          )
        : undefined;

    const regPatch =
      data.solopreneurRegistration !== undefined
        ? normalizeSolopreneurRegistration(
            data.solopreneurRegistration === null ||
              data.solopreneurRegistration === ""
              ? undefined
              : data.solopreneurRegistration,
          )
        : undefined;

    const effectivePersona =
      personaPatch ??
      normalizeTaxPersona(existing?.taxPersona ?? undefined);
    const effectiveReg =
      regPatch ??
      normalizeSolopreneurRegistration(
        existing?.solopreneurRegistration ?? undefined,
      );

    const personaAfterTaxPatch =
      data.taxPersona !== undefined
        ? data.taxPersona === null || data.taxPersona === ""
          ? null
          : personaPatch
        : normalizeTaxPersona(existing?.taxPersona ?? undefined);

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.firstName !== undefined && { firstName: data.firstName }),
        ...(data.lastName !== undefined && { lastName: data.lastName }),
        ...(data.address !== undefined && { address: data.address }),
        ...(data.state !== undefined && { state: data.state }),
        ...(data.lga !== undefined && { lga: data.lga }),
        ...(data.purpose !== undefined && { purpose: data.purpose }),
        ...(data.roleDescription !== undefined && {
          roleDescription: data.roleDescription,
        }),
        ...(data.teamSize !== undefined && { teamSize: data.teamSize }),
        ...(data.adminCount !== undefined && { adminCount: data.adminCount }),
        ...(data.organizationName !== undefined && {
          organizationName: data.organizationName,
        }),
        ...(data.organizationAddress !== undefined && {
          organizationAddress: data.organizationAddress,
        }),
        ...(data.logo !== undefined && { logo: data.logo }),
        ...(data.taxPersona !== undefined && {
          taxPersona:
            data.taxPersona === null || data.taxPersona === ""
              ? null
              : personaPatch,
        }),
        ...(data.taxPersona !== undefined &&
          (data.taxPersona === null ||
            data.taxPersona === "" ||
            (personaPatch && personaPatch !== "SOLOPRENEUR")) && {
            solopreneurRegistration: null,
          }),
        ...(data.solopreneurRegistration !== undefined &&
          personaAfterTaxPatch === "SOLOPRENEUR" && {
            solopreneurRegistration:
              data.solopreneurRegistration === null ||
              data.solopreneurRegistration === ""
                ? null
                : regPatch,
          }),
        ...(data.employmentGrossSalaryMonthly !== undefined && {
          employmentGrossSalaryMonthly:
            data.employmentGrossSalaryMonthly === null
              ? null
              : new Decimal(Number(data.employmentGrossSalaryMonthly)),
        }),
      },
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
        currentOnboardingStep: true,
        onboardingCompletedAt: true,
        taxPersona: true,
        solopreneurRegistration: true,
        employmentGrossSalaryMonthly: true,
        filingRemindersEnabled: true,
        payersNotificationsEnabled: true,
        complianceUpdatesEnabled: true,
        twoFactorEnabled: true,
        createdAt: true,
        updatedAt: true,
        userRoles: { include: { role: { select: { id: true, name: true } } } },
      },
    });
    const primaryRole = updated.userRoles?.[0]?.role;
    const { employmentGrossSalaryMonthly: salaryDec, ...updatedRest } =
      updated;
    return {
      ...updatedRest,
      employmentGrossSalaryMonthly:
        salaryDec != null ? Number(salaryDec) : null,
      role: primaryRole ?? null,
      userRoles: undefined,
    };
  },

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { password: true },
    });
    if (!user) return { success: false as const, message: "User not found" };
    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match)
      return {
        success: false as const,
        message: "Current password is incorrect",
      };
    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashed },
    });
    return { success: true as const };
  },

  async getBusinessProfile(userId: string) {
    const [user, business] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          organizationName: true,
          organizationAddress: true,
          logo: true,
          state: true,
          address: true,
        },
      }),
      prisma.business.findFirst({ where: { userId } }),
    ]);
    if (!user) return null;
    const b = business as BusinessWithExtras | null | undefined;
    const taxProfile = await buildTaxEligibilityProfileForUser(userId);
    return {
      businessName: b?.name ?? user.organizationName ?? "",
      tin: b?.tin ?? user.organizationName ?? "",
      rcNumber: b?.rcNumber ?? null,
      businessType: b?.businessType ?? "Business",
      sector: b?.sector ?? null,
      stateOfResidence: b?.stateOfResidence ?? user.state ?? null,
      bankAccount: b?.bankAccount ?? null,
      address:
        b?.streetAddress ?? user.organizationAddress ?? user.address ?? null,
      logo: user.logo ?? null,
      totalFixedAssets: businessProfileMoneyToNumber(b?.totalFixedAssets),
      annualGrossTurnover: businessProfileMoneyToNumber(b?.annualGrossTurnover),
      professionalService: providesProfessionalServicesAnswerToBoolean(
        taxProfile?.providesProfessionalServices ?? null,
      ),
      providesProfessionalServices:
        taxProfile?.providesProfessionalServices ?? null,
      primaryBusinessActivity: taxProfile?.primaryBusinessActivity ?? null,
      citClassification:
        taxProfile?.taxEligibility.citClassification ?? null,
      vatClassification:
        taxProfile?.taxEligibility.vatClassification ?? null,
      taxEligibility: taxProfile?.taxEligibility ?? null,
    };
  },

  async getTaxEligibilityProfile(userId: string) {
    return buildTaxEligibilityProfileForUser(userId);
  },

  async updateBusinessProfile(
    userId: string,
    data: {
      businessName?: string;
      tin?: string;
      rcNumber?: string;
      businessType?: string;
      sector?: string | null;
      stateOfResidence?: string;
      bankAccount?: string;
      address?: string;
      logo?: string | null;
      totalFixedAssets?: number | null;
      annualGrossTurnover?: number | null;
      providesProfessionalServices?: ProvidesProfessionalServicesAnswer | null;
      primaryBusinessActivity?: PrimaryBusinessActivity | null;
    },
  ) {
    const business = await prisma.business.findFirst({ where: { userId } });

    const mergedProvides =
      data.providesProfessionalServices !== undefined
        ? data.providesProfessionalServices
        : normalizeProvidesProfessionalServices(
            business?.providesProfessionalServices,
          );
    const mergedActivity =
      data.primaryBusinessActivity !== undefined
        ? data.primaryBusinessActivity
        : normalizePrimaryBusinessActivity(business?.primaryBusinessActivity);
    if (mergedProvides === "NOT_SURE" && !mergedActivity) {
      throw new HttpReplyError(
        422,
        "primaryBusinessActivity is required when providesProfessionalServices is NOT_SURE",
        null,
        "VALIDATION_ERROR",
      );
    }

    const payload: Record<string, unknown> = {
      ...(data.businessName !== undefined && { name: data.businessName }),
      ...(data.tin !== undefined && { tin: data.tin }),
      ...(data.rcNumber !== undefined && { rcNumber: data.rcNumber }),
      ...(data.businessType !== undefined && {
        businessType: data.businessType,
      }),
      ...(data.sector !== undefined && {
        sector: normalizeBusinessProfileSector(data.sector),
      }),
      ...(data.stateOfResidence !== undefined && {
        stateOfResidence: data.stateOfResidence,
      }),
      ...(data.bankAccount !== undefined && { bankAccount: data.bankAccount }),
      ...(data.address !== undefined && { streetAddress: data.address }),
      ...(data.totalFixedAssets !== undefined && {
        totalFixedAssets: decimalFromBusinessProfileMoney(data.totalFixedAssets),
      }),
      ...(data.annualGrossTurnover !== undefined && {
        annualGrossTurnover: decimalFromBusinessProfileMoney(
          data.annualGrossTurnover,
        ),
      }),
      ...(data.providesProfessionalServices !== undefined && {
        providesProfessionalServices: data.providesProfessionalServices,
      }),
      ...(data.primaryBusinessActivity !== undefined && {
        primaryBusinessActivity: data.primaryBusinessActivity,
      }),
    };
    if (business) {
      await prisma.business.update({
        where: { id: business.id },
        data: payload as never,
      });
    } else {
      await prisma.business.create({
        data: {
          userId,
          name: data.businessName ?? "Business",
          incomeType: "employment",
          ...(payload as Record<string, unknown>),
        },
      });
    }
    const userUpdate: { organizationName?: string; logo?: string | null } = {};
    if (data.businessName !== undefined) userUpdate.organizationName = data.businessName;
    if (data.logo !== undefined) userUpdate.logo = data.logo === "" ? null : data.logo;
    if (Object.keys(userUpdate).length > 0) {
      await prisma.user.update({
        where: { id: userId },
        data: userUpdate,
      });
    }
    return this.getBusinessProfile(userId);
  },

  async getNotificationSettings(userId: string) {
    const user = (await prisma.user.findUnique({
      where: { id: userId },
      select: {
        filingRemindersEnabled: true,
        payersNotificationsEnabled: true,
        complianceUpdatesEnabled: true,
        twoFactorEnabled: true,
        taxDeadlineEnabled: true,
        filingConfirmationsEnabled: true,
        weeklySummaryEnabled: true,
      } as unknown as Parameters<typeof prisma.user.findUnique>[0]["select"],
    })) as UserWithNotificationPrefs | null;
    return user
      ? {
          filingReminders: user.filingRemindersEnabled ?? true,
          payersNotifications: user.payersNotificationsEnabled ?? true,
          complianceUpdates: user.complianceUpdatesEnabled ?? false,
          twoFactorEnabled: user.twoFactorEnabled ?? false,
          taxDeadline: user.taxDeadlineEnabled ?? true,
          filingConfirmations: user.filingConfirmationsEnabled ?? true,
          weeklySummary: user.weeklySummaryEnabled ?? true,
        }
      : null;
  },

  async updateNotificationSettings(
    userId: string,
    data: {
      filingReminders?: boolean;
      payersNotifications?: boolean;
      complianceUpdates?: boolean;
      twoFactorEnabled?: boolean;
      taxDeadline?: boolean;
      filingConfirmations?: boolean;
      weeklySummary?: boolean;
    },
  ) {
    const updatePayload: Record<string, boolean> = {};
    if (data.filingReminders !== undefined)
      updatePayload.filingRemindersEnabled = data.filingReminders;
    if (data.payersNotifications !== undefined)
      updatePayload.payersNotificationsEnabled = data.payersNotifications;
    if (data.complianceUpdates !== undefined)
      updatePayload.complianceUpdatesEnabled = data.complianceUpdates;
    if (data.twoFactorEnabled !== undefined)
      updatePayload.twoFactorEnabled = data.twoFactorEnabled;
    if (data.taxDeadline !== undefined)
      updatePayload.taxDeadlineEnabled = data.taxDeadline;
    if (data.filingConfirmations !== undefined)
      updatePayload.filingConfirmationsEnabled = data.filingConfirmations;
    if (data.weeklySummary !== undefined)
      updatePayload.weeklySummaryEnabled = data.weeklySummary;
    await prisma.user.update({
      where: { id: userId },
      data: updatePayload as never,
    });
    return this.getNotificationSettings(userId);
  },

  async getConsultant(userId: string) {
    const conn = await prisma.consultantConnection.findFirst({
      where: { userId, status: "active" },
      include: {
        consultant: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            organizationName: true,
            phone: true,
          },
        },
        invitation: true,
      },
    });
    if (!conn) return null;
    const c = conn as typeof conn & ConsultantConnWithExtras;
    const taxForms = c.managingTaxForms
      ? c.managingTaxForms.split(",").map((s: string) => s.trim())
      : ["VAT", "WHT", "PITT", "CIT"];
    const consultantName =
      c.consultantDisplayName ??
      conn.invitation?.invitedBusinessName ??
      (conn.consultant
        ? `${conn.consultant.firstName} ${conn.consultant.lastName}`.trim() ||
          conn.consultant.organizationName
        : null) ??
      "Consultant";
    return {
      id: conn.id,
      name: consultantName,
      managingTaxForms: taxForms,
      status: conn.status,
      filingAuthorization: conn.filingAuthorization,
      consultant: conn.consultant
        ? {
            id: conn.consultant.id,
            firstName: conn.consultant.firstName,
            lastName: conn.consultant.lastName,
            email: conn.consultant.email,
            organizationName: conn.consultant.organizationName ?? null,
            phone: conn.consultant.phone ?? null,
          }
        : null,
    };
  },

  async setConsultantFilingAuthorization(
    userId: string,
    authorized: boolean,
  ): Promise<
    | { ok: true; filingAuthorization: boolean; emailSent: boolean }
    | { ok: false; code: "NO_ACTIVE_CONSULTANT" }
  > {
    const conn = await prisma.consultantConnection.findFirst({
      where: { userId, status: "active" },
      include: {
        consultant: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
            organizationName: true,
          },
        },
      },
    });
    if (!conn) return { ok: false, code: "NO_ACTIVE_CONSULTANT" };

    const previous = conn.filingAuthorization;
    if (previous === authorized) {
      return {
        ok: true,
        filingAuthorization: authorized,
        emailSent: false,
      };
    }

    await prisma.consultantConnection.update({
      where: { id: conn.id },
      data: { filingAuthorization: authorized },
    });

    let emailSent = false;
    if (authorized && !previous && conn.consultant?.email) {
      const client = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          organizationName: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      });
      const businessDisplayName =
        client?.organizationName?.trim() ||
        `${client?.firstName ?? ""} ${client?.lastName ?? ""}`.trim() ||
        client?.email ||
        "Your client";
      const consultantGreeting =
        `${conn.consultant.firstName} ${conn.consultant.lastName}`.trim() ||
        conn.consultant.organizationName ||
        conn.consultant.email;
      const { sendConsultantFilingAuthorizationEmail } = await import(
        "../../services/emailService"
      );
      const sent = await sendConsultantFilingAuthorizationEmail(
        conn.consultant.email,
        consultantGreeting,
        businessDisplayName,
      );
      emailSent = sent.success;
    }

    return { ok: true, filingAuthorization: authorized, emailSent };
  },

  async revokeConsultant(userId: string, connectionId: string) {
    const conn = await prisma.consultantConnection.findFirst({
      where: { id: connectionId, userId },
    });
    if (!conn) {
      return true;
    }

    await prisma.$transaction([
      prisma.consultantConnection.delete({
        where: { id: connectionId },
      }),
      prisma.invitation.update({
        where: { id: conn.invitationId },
        data: {
          requestedUserId: null,
          status: "rejected",
        },
      }),
    ]);
    return true;
  },
};
