import { prisma } from "../../config/database";
import { randomBytes } from "crypto";
import {
  generateConsultantOnboardingToken,
  verifyConsultantOnboardingToken,
} from "../../utils/consultantOnboardingToken";
import type {
  Step1Body,
  Step2Body,
  Step3Body,
  Step4Body,
  Step5Body,
  Step6Body,
  Step7Body,
} from "../../interfaces/enterprise/consultantOnboarding";

function uniqueSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export const consultantOnboardingService = {
  verifyToken(token: string) {
    return verifyConsultantOnboardingToken(token);
  },

  async getSession(sessionId: string) {
    return prisma.consultantOnboardingSession.findUnique({
      where: { id: sessionId },
      include: {
        firmIdentity: true,
        partners: {
          include: { certifications: true },
          orderBy: { sortOrder: "asc" },
        },
        scope: true,
        subscription: true,
        paymentSetup: true,
        compliance: true,
      },
    });
  },

  async step1(data: Step1Body) {
    const sessionToken = uniqueSessionToken();
    const session = await prisma.consultantOnboardingSession.create({
      data: {
        sessionToken,
        currentStep: 1,
        status: "draft",
        firmIdentity: {
          create: {
            businessStructure: data.businessStructure,
            firmName: data.firmName,
            registrationType: data.registrationType,
            rcNumber: data.rcNumber ?? null,
            yearOfIncorporation: data.yearOfIncorporation ?? null,
            countryOfRegistration: data.countryOfRegistration,
          },
        },
      },
      include: { firmIdentity: true },
    });
    const token = generateConsultantOnboardingToken(session.id);
    return { session, token };
  },

  async step2(sessionId: string, data: Step2Body) {
    const session = await prisma.consultantOnboardingSession.findUnique({
      where: { id: sessionId },
      include: { partners: true },
    });
    if (!session)
      return { success: false as const, message: "Session not found" };
    if (session.status !== "draft")
      return { success: false as const, message: "Session not in draft" };

    await prisma.$transaction(async (tx) => {
      await tx.consultantPartner.deleteMany({ where: { sessionId } });
      const principal = await tx.consultantPartner.create({
        data: {
          sessionId,
          fullName: data.principalPartner.fullName,
          email: data.principalPartner.email,
          phone: data.principalPartner.phone,
          yearsOfExperience: data.principalPartner.yearsOfExperience ?? null,
          isPrincipal: true,
          sortOrder: 0,
        },
      });
      for (const c of data.principalPartner.certifications) {
        await tx.consultantCertification.create({
          data: {
            partnerId: principal.id,
            qualificationName: c.qualificationName,
            issuingBody: c.issuingBody,
            year: c.year ?? null,
            national: c.national ?? null,
          },
        });
      }
      await tx.consultantOnboardingSession.update({
        where: { id: sessionId },
        data: { currentStep: 2 },
      });
    });
    return { success: true as const };
  },

  async step3(sessionId: string, data: Step3Body) {
    const session = await prisma.consultantOnboardingSession.findUnique({
      where: { id: sessionId },
      include: { partners: true },
    });
    if (!session)
      return { success: false as const, message: "Session not found" };
    if (session.status !== "draft")
      return { success: false as const, message: "Session not in draft" };

    const principal = session.partners.find((p) => p.isPrincipal);
    await prisma.$transaction(async (tx) => {
      await tx.consultantPartner.deleteMany({
        where: { sessionId, isPrincipal: false },
      });
      for (const [idx, ap] of data.additionalPartners.entries()) {
        const partner = await tx.consultantPartner.create({
          data: {
            sessionId,
            fullName: ap.partnerName,
            role: ap.role,
            yearsOfExperience: ap.yearsOfExperience ?? null,
            isPrincipal: false,
            sortOrder: principal ? idx + 1 : idx,
          },
        });
        for (const c of ap.certifications) {
          await tx.consultantCertification.create({
            data: {
              partnerId: partner.id,
              qualificationName: c.qualification,
              issuingBody: c.issuingBody,
              year: c.year ?? null,
              national: c.national ?? null,
            },
          });
        }
      }
      await tx.consultantOnboardingSession.update({
        where: { id: sessionId },
        data: { currentStep: 3 },
      });
    });
    return { success: true as const };
  },

  async step4(sessionId: string, data: Step4Body) {
    const session = await prisma.consultantOnboardingSession.findUnique({
      where: { id: sessionId },
    });
    if (!session)
      return { success: false as const, message: "Session not found" };
    if (session.status !== "draft")
      return { success: false as const, message: "Session not in draft" };

    await prisma.consultantScope.upsert({
      where: { sessionId },
      create: {
        sessionId,
        primaryState: data.primaryState,
        additionalStates: data.additionalStates as object,
        taxTypesSpecializations: data.taxTypesSpecializations as object,
        businessSizeServed: data.businessSizeServed,
      },
      update: {
        primaryState: data.primaryState,
        additionalStates: data.additionalStates as object,
        taxTypesSpecializations: data.taxTypesSpecializations as object,
        businessSizeServed: data.businessSizeServed,
      },
    });
    await prisma.consultantOnboardingSession.update({
      where: { id: sessionId },
      data: { currentStep: 4 },
    });
    return { success: true as const };
  },

  async step5(sessionId: string, data: Step5Body) {
    const session = await prisma.consultantOnboardingSession.findUnique({
      where: { id: sessionId },
    });
    if (!session)
      return { success: false as const, message: "Session not found" };
    if (session.status !== "draft")
      return { success: false as const, message: "Session not in draft" };

    const reminderConfig = data.perFilingReminderConfig
      ? (data.perFilingReminderConfig as object)
      : undefined;
    await prisma.consultantSubscription.upsert({
      where: { sessionId },
      create: {
        sessionId,
        billingOption: data.billingOption,
        enableReminders: data.enableAutomatedComplianceReminders,
        ...(reminderConfig !== undefined && { reminderConfig }),
      },
      update: {
        billingOption: data.billingOption,
        enableReminders: data.enableAutomatedComplianceReminders,
        ...(reminderConfig !== undefined && { reminderConfig }),
      },
    });
    await prisma.consultantOnboardingSession.update({
      where: { id: sessionId },
      data: { currentStep: 5 },
    });
    return { success: true as const };
  },

  async step6(sessionId: string, data: Step6Body) {
    const session = await prisma.consultantOnboardingSession.findUnique({
      where: { id: sessionId },
    });
    if (!session)
      return { success: false as const, message: "Session not found" };
    if (session.status !== "draft")
      return { success: false as const, message: "Session not in draft" };

    await prisma.consultantPaymentSetup.upsert({
      where: { sessionId },
      create: {
        sessionId,
        paymentMethod: data.paymentMethod,
        bankAccountNumber: data.bankAccountNumber ?? null,
        warrantApproval: data.warrantApproval ?? null,
        selfRemittance: data.selfRemittance ?? null,
      },
      update: {
        paymentMethod: data.paymentMethod,
        bankAccountNumber: data.bankAccountNumber ?? null,
        warrantApproval: data.warrantApproval ?? null,
        selfRemittance: data.selfRemittance ?? null,
      },
    });
    await prisma.consultantOnboardingSession.update({
      where: { id: sessionId },
      data: { currentStep: 6 },
    });
    return { success: true as const };
  },

  async step7(sessionId: string, data: Step7Body) {
    const session = await prisma.consultantOnboardingSession.findUnique({
      where: { id: sessionId },
    });
    if (!session)
      return { success: false as const, message: "Session not found" };
    if (session.status !== "draft")
      return { success: false as const, message: "Session not in draft" };

    const submittedAt = data.saveAsDraft ? null : new Date();
    const status = data.saveAsDraft ? "draft" : "submitted";

    await prisma.consultantCompliance.upsert({
      where: { sessionId },
      create: {
        sessionId,
        cacDocumentUrl: data.cacDocumentUrl ?? null,
        principalPartnerIdUrl: data.principalPartnerIdUrl ?? null,
        professionalCertificateUrl: data.professionalCertificateUrl ?? null,
        amlDocumentUrl: data.amlDocumentUrl ?? null,
        firmProfileUrl: data.firmProfileUrl ?? null,
        declarationAccuracy: data.declarationAccuracy,
        declarationFirsCompliance: data.declarationFirsCompliance,
        declarationSuspensionPolicy: data.declarationSuspensionPolicy,
        submittedAt,
      },
      update: {
        cacDocumentUrl: data.cacDocumentUrl ?? null,
        principalPartnerIdUrl: data.principalPartnerIdUrl ?? null,
        professionalCertificateUrl: data.professionalCertificateUrl ?? null,
        amlDocumentUrl: data.amlDocumentUrl ?? null,
        firmProfileUrl: data.firmProfileUrl ?? null,
        declarationAccuracy: data.declarationAccuracy,
        declarationFirsCompliance: data.declarationFirsCompliance,
        declarationSuspensionPolicy: data.declarationSuspensionPolicy,
        submittedAt: submittedAt ?? undefined,
      },
    });
    await prisma.consultantOnboardingSession.update({
      where: { id: sessionId },
      data: { currentStep: 7, status },
    });
    return { success: true as const };
  },

  async reviewAndSubmit(sessionId: string) {
    const session = await prisma.consultantOnboardingSession.findUnique({
      where: { id: sessionId },
      include: { compliance: true },
    });
    if (!session)
      return { success: false as const, message: "Session not found" };
    if (session.status !== "draft")
      return {
        success: false as const,
        message: "Already submitted or activated",
      };
    if (!session.compliance?.submittedAt) {
      return {
        success: false as const,
        message: "Complete step 7 and submit before review",
      };
    }
    await prisma.consultantOnboardingSession.update({
      where: { id: sessionId },
      data: { status: "submitted" },
    });
    return { success: true as const };
  },

  async activate(sessionId: string) {
    const session = await prisma.consultantOnboardingSession.findUnique({
      where: { id: sessionId },
    });
    if (!session)
      return { success: false as const, message: "Session not found" };
    if (session.status === "activated")
      return { success: false as const, message: "Already activated" };
    await prisma.consultantOnboardingSession.update({
      where: { id: sessionId },
      data: { status: "activated", currentStep: 8 },
    });
    return { success: true as const };
  },
};
