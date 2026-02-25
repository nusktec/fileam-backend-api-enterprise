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

  async getProfile(companyId: string, userId?: string) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) return null;
    const profile = await prisma.enterpriseBusinessProfile.findUnique({
      where: { companyId },
      include: { activities: { orderBy: { eventDate: "desc" }, take: 20 } },
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
      activities: p.activities.map((a) => ({
        activity: a.activity,
        eventDate: a.eventDate,
      })),
    };
  },

  async getActivities(companyId: string) {
    const profile = await prisma.enterpriseBusinessProfile.findUnique({
      where: { companyId },
      include: { activities: { orderBy: { eventDate: "desc" } } },
    });
    return profile?.activities ?? [];
  },

  async updateProfile(
    companyId: string,
    data: {
      companyName: string;
      businessType: string;
      industry: string;
      registrationDate: Date;
      tin: string;
      businessAddress: string;
      phoneNumber: string;
      emailAddress: string;
      website: string;
      logo?: string | null;
    },
  ) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) return null;
    const createPayload = {
      companyId,
      companyName: data.companyName,
      businessType: data.businessType,
      industry: data.industry,
      registrationDate: data.registrationDate,
      tin: data.tin,
      businessAddress: data.businessAddress,
      phoneNumber: data.phoneNumber,
      emailAddress: data.emailAddress,
      website: data.website,
      logo: data.logo ?? undefined,
      subscriptionPlan: "Pro Plan",
      monthlyPayment: new Decimal(99.99),
      nextRenewalDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      compliancePercent: 0,
    };
    const updatePayload = {
      companyName: data.companyName,
      businessType: data.businessType,
      industry: data.industry,
      registrationDate: data.registrationDate,
      tin: data.tin,
      businessAddress: data.businessAddress,
      phoneNumber: data.phoneNumber,
      emailAddress: data.emailAddress,
      website: data.website,
      ...(data.logo !== undefined && { logo: data.logo }),
    };
    const profile = await prisma.enterpriseBusinessProfile.upsert({
      where: { companyId },
      create: createPayload as Prisma.EnterpriseBusinessProfileUncheckedCreateInput,
      update: updatePayload as Prisma.EnterpriseBusinessProfileUncheckedUpdateInput,
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
