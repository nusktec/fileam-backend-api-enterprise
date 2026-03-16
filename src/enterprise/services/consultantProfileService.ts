import { prisma } from "../../config/database";

export const consultantProfileService = {
  async getBusiness(userId: string) {
    const session = await prisma.consultantOnboardingSession.findFirst({
      where: { userId },
      include: { firmIdentity: true },
      orderBy: { updatedAt: "desc" },
    });
    if (!session?.firmIdentity) {
      return {
        firmName: null,
        businessStructure: null,
        registrationType: null,
        rcNumber: null,
        yearOfIncorporation: null,
        countryOfRegistration: null,
      };
    }
    const f = session.firmIdentity;
    return {
      firmName: f.firmName,
      businessStructure: f.businessStructure,
      registrationType: f.registrationType,
      rcNumber: f.rcNumber,
      yearOfIncorporation: f.yearOfIncorporation,
      countryOfRegistration: f.countryOfRegistration,
    };
  },

  async updateBusiness(
    userId: string,
    data: {
      firmName?: string;
      businessStructure?: string;
      registrationType?: string;
      rcNumber?: string | null;
      yearOfIncorporation?: number | null;
      countryOfRegistration?: string;
    },
  ) {
    const session = await prisma.consultantOnboardingSession.findFirst({
      where: { userId },
      include: { firmIdentity: true },
      orderBy: { updatedAt: "desc" },
    });
    if (!session) {
      return null;
    }
    const payload = {
      ...(data.firmName !== undefined && { firmName: data.firmName }),
      ...(data.businessStructure !== undefined && {
        businessStructure: data.businessStructure,
      }),
      ...(data.registrationType !== undefined && {
        registrationType: data.registrationType,
      }),
      ...(data.rcNumber !== undefined && { rcNumber: data.rcNumber }),
      ...(data.yearOfIncorporation !== undefined && {
        yearOfIncorporation: data.yearOfIncorporation,
      }),
      ...(data.countryOfRegistration !== undefined && {
        countryOfRegistration: data.countryOfRegistration,
      }),
    };
    if (session.firmIdentity) {
      await prisma.$transaction(async (tx) => {
        await tx.consultantFirmIdentity.update({
          where: { sessionId: session.id },
          data: payload,
        });
        if (data.firmName !== undefined) {
          await tx.user.update({
            where: { id: userId },
            data: { organizationName: data.firmName },
          });
        }
      });
    } else {
      const firmName = data.firmName ?? "Firm";
      await prisma.$transaction([
        prisma.consultantFirmIdentity.create({
          data: {
            sessionId: session.id,
            businessStructure: data.businessStructure ?? "sole_proprietorship",
            firmName,
            registrationType: data.registrationType ?? "registered",
            rcNumber: data.rcNumber ?? null,
            yearOfIncorporation: data.yearOfIncorporation ?? null,
            countryOfRegistration: data.countryOfRegistration ?? "Nigeria",
          },
        }),
        prisma.user.update({
          where: { id: userId },
          data: { organizationName: firmName },
        }),
      ]);
    }
    return this.getBusiness(userId);
  },
};
