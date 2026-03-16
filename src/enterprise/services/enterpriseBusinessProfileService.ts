import { prisma } from "../../config/database";
import type { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

const BUSINESS_TYPES = [
  "Consulting",
  "LLC",
  "Partnership",
  "Sole Proprietorship",
  "Corporation",
  "Non-Profit",
  "Other",
];
const INDUSTRIES = [
  "IT & Services",
  "Finance",
  "Healthcare",
  "Retail",
  "Manufacturing",
  "Legal",
  "Construction",
  "Education",
  "Other",
];

function decimalToNumber(d: Decimal | null | undefined): number {
  if (d == null) return 0;
  return Number(d);
}

export const enterpriseBusinessProfileService = {
  getBusinessTypes: () => BUSINESS_TYPES,
  getIndustries: () => INDUSTRIES,

  async getProfile(companyId: string, userId?: string, linkedUserId?: string) {
    if (linkedUserId) {
      const [user, business] = await Promise.all([
        prisma.user.findUnique({
          where: { id: linkedUserId },
          select: {
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
            organizationName: true,
            organizationAddress: true,
            logo: true,
          },
        }),
        prisma.business.findFirst({
          where: { userId: linkedUserId },
        }),
      ]);
      if (!user) return null;
      const b = business;
      return {
        companyName: b?.name ?? user.organizationName ?? `${user.firstName} ${user.lastName}`.trim(),
        businessType: b?.businessType ?? "",
        industry: b?.sector ?? "",
        registrationDate: b?.createdAt ?? new Date(),
        tin: b?.tin ?? "",
        businessAddress: b?.streetAddress ?? user.organizationAddress ?? "",
        phoneNumber: user.phone ?? "",
        emailAddress: user.email,
        website: "",
        logo: user.logo ?? null,
        subscriptionPlan: "Client",
        monthlyPayment: 0,
        nextRenewalDate: new Date(),
        compliancePercent: 0,
        activities: [],
      };
    }
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) return null;
    const profile = await prisma.enterpriseBusinessProfile.findUnique({
      where: { companyId },
    });
    let logoFallback: string | null = null;
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { logo: true },
      });
      logoFallback = user?.logo ?? null;
    }
    if (!profile)
      return {
        companyName: company.name,
        businessType: "",
        industry: "",
        registrationDate: new Date(),
        tin: "",
        businessAddress: "",
        phoneNumber: "",
        emailAddress: "",
        website: "",
        logo: logoFallback,
        subscriptionPlan: "",
        monthlyPayment: 0,
        nextRenewalDate: new Date(),
        compliancePercent: 0,
        activities: [],
      };
    const p = profile as typeof profile & { logo?: string | null };
    return {
      ...p,
      companyName: p.companyName,
      businessType: p.businessType,
      industry: p.industry,
      registrationDate: p.registrationDate,
      tin: p.tin,
      businessAddress: p.businessAddress,
      phoneNumber: p.phoneNumber,
      emailAddress: p.emailAddress,
      website: p.website,
      logo: p.logo ?? logoFallback ?? null,
      subscriptionPlan: p.subscriptionPlan,
      monthlyPayment: decimalToNumber(p.monthlyPayment),
      nextRenewalDate: p.nextRenewalDate,
      compliancePercent: p.compliancePercent,
      activities: [],
    };
  },

  async getActivities(companyId: string) {
    return [];
  },

  async updateProfile(
    companyId: string,
    data: Partial<{
      companyName: string;
      businessType: string;
      industry: string;
      registrationDate: Date;
      tin: string;
      businessAddress: string;
      phoneNumber: string;
      emailAddress: string;
      website: string;
      logo: string | null;
    }>,
  ) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) return null;

    const existing = await prisma.enterpriseBusinessProfile.findUnique({
      where: { companyId },
    });

    const defaults = {
      companyName: company.name,
      businessType: "",
      industry: "",
      registrationDate: new Date(),
      tin: "",
      businessAddress: "",
      phoneNumber: "",
      emailAddress: "",
      website: "",
      logo: undefined as string | undefined,
    };

    const merged = {
      ...defaults,
      ...(existing && {
        companyName: existing.companyName,
        businessType: existing.businessType,
        industry: existing.industry,
        registrationDate: existing.registrationDate,
        tin: existing.tin,
        businessAddress: existing.businessAddress,
        phoneNumber: existing.phoneNumber,
        emailAddress: existing.emailAddress,
        website: existing.website,
        logo: existing.logo ?? undefined,
      }),
      ...data,
    };

    const createPayload = {
      companyId,
      companyName: merged.companyName,
      businessType: merged.businessType,
      industry: merged.industry,
      registrationDate: merged.registrationDate,
      tin: merged.tin,
      businessAddress: merged.businessAddress,
      phoneNumber: merged.phoneNumber,
      emailAddress: merged.emailAddress,
      website: merged.website,
      logo: merged.logo ?? undefined,
      subscriptionPlan: "Pro Plan",
      monthlyPayment: new Decimal(99.99),
      nextRenewalDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      compliancePercent: 0,
    };

    const updatePayload: Record<string, unknown> = {};
    if (data.companyName !== undefined) updatePayload.companyName = data.companyName;
    if (data.businessType !== undefined) updatePayload.businessType = data.businessType;
    if (data.industry !== undefined) updatePayload.industry = data.industry;
    if (data.registrationDate !== undefined) updatePayload.registrationDate = data.registrationDate;
    if (data.tin !== undefined) updatePayload.tin = data.tin;
    if (data.businessAddress !== undefined) updatePayload.businessAddress = data.businessAddress;
    if (data.phoneNumber !== undefined) updatePayload.phoneNumber = data.phoneNumber;
    if (data.emailAddress !== undefined) updatePayload.emailAddress = data.emailAddress;
    if (data.website !== undefined) updatePayload.website = data.website;
    if (data.logo !== undefined) updatePayload.logo = data.logo;

    const profile = await prisma.enterpriseBusinessProfile.upsert({
      where: { companyId },
      create: createPayload as Prisma.EnterpriseBusinessProfileUncheckedCreateInput,
      update: Object.keys(updatePayload).length > 0
        ? (updatePayload as Prisma.EnterpriseBusinessProfileUncheckedUpdateInput)
        : updatePayload,
    });
    return profile;
  },

  async upgradeSubscription(companyId: string, plan?: string) {
    const profile = await prisma.enterpriseBusinessProfile.findUnique({
      where: { companyId },
    });
    if (!profile) return null;
    const nextRenewal = new Date(profile.nextRenewalDate);
    nextRenewal.setFullYear(nextRenewal.getFullYear() + 1);
    await prisma.enterpriseBusinessProfile.update({
      where: { companyId },
      data: {
        subscriptionPlan: plan ?? "Enterprise Plan",
        monthlyPayment: new Decimal(199.99),
        nextRenewalDate: nextRenewal,
      },
    });
    return prisma.enterpriseBusinessProfile.findUnique({
      where: { companyId },
    });
  },
};
