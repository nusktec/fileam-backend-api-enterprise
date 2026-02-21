import { prisma } from "../../config/database";
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

  async getProfile(companyId: string) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) return null;
    const profile = await prisma.enterpriseBusinessProfile.findUnique({
      where: { companyId },
      include: { activities: { orderBy: { eventDate: "desc" }, take: 20 } },
    });
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
        subscriptionPlan: "",
        monthlyPayment: 0,
        nextRenewalDate: new Date(),
        compliancePercent: 0,
        activities: [],
      };
    return {
      ...profile,
      companyName: profile.companyName,
      businessType: profile.businessType,
      industry: profile.industry,
      registrationDate: profile.registrationDate,
      tin: profile.tin,
      businessAddress: profile.businessAddress,
      phoneNumber: profile.phoneNumber,
      emailAddress: profile.emailAddress,
      website: profile.website,
      subscriptionPlan: profile.subscriptionPlan,
      monthlyPayment: decimalToNumber(profile.monthlyPayment),
      nextRenewalDate: profile.nextRenewalDate,
      compliancePercent: profile.compliancePercent,
      activities: profile.activities.map((a) => ({
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
    },
  ) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) return null;
    const profile = await prisma.enterpriseBusinessProfile.upsert({
      where: { companyId },
      create: {
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
        subscriptionPlan: "Pro Plan",
        monthlyPayment: new Decimal(99.99),
        nextRenewalDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        compliancePercent: 0,
      },
      update: {
        companyName: data.companyName,
        businessType: data.businessType,
        industry: data.industry,
        registrationDate: data.registrationDate,
        tin: data.tin,
        businessAddress: data.businessAddress,
        phoneNumber: data.phoneNumber,
        emailAddress: data.emailAddress,
        website: data.website,
      },
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
