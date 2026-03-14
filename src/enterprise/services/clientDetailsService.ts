import { prisma } from "../../config/database";

export async function getClientDetails(companyId: string, linkedUserId: string) {
  const [user, business, taxConfig, thresholdStatus] = await Promise.all([
    prisma.user.findUnique({
      where: { id: linkedUserId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        address: true,
        organizationName: true,
      },
    }),
    prisma.business.findFirst({
      where: { userId: linkedUserId },
    }),
    prisma.clientTaxConfiguration.findUnique({
      where: { companyId },
    }),
    prisma.enterpriseThresholdStatus.findUnique({
      where: { companyId },
    }),
  ]);

  if (!user) return null;

  return {
    client: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone ?? null,
      address: user.address ?? business?.streetAddress ?? null,
      displayName:
        user.organizationName ??
        business?.name ??
        `${user.firstName} ${user.lastName}`.trim(),
    },
    business: business
      ? {
          id: business.id,
          name: business.name,
          rcNumber: business.rcNumber ?? null,
          tin: business.tin ?? null,
          industry: business.sector ?? null,
          turnoverBand: business.turnoverBand ?? null,
          vatStatus: business.vatStatus ?? null,
          city: business.city ?? null,
          website: business.website ?? null,
          contactEmail: business.contactEmail ?? null,
          streetAddress: business.streetAddress ?? null,
          stateOfResidence: business.stateOfResidence ?? null,
        }
      : null,
    taxConfiguration: taxConfig
      ? {
          vat: taxConfig.vat,
          paye: taxConfig.paye,
          wht: taxConfig.wht,
          cit: taxConfig.cit,
          stampDuties: taxConfig.stampDuties,
        }
      : null,
    vatThresholdStatus: thresholdStatus
      ? { status: thresholdStatus.status, message: thresholdStatus.message }
      : null,
  };
}
