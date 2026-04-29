import { prisma } from "../../config/database";
import {
  getFilingsSummary,
  getRecentFilingsForClientConsultant,
} from "./enterpriseFilingsService";

export async function getClientDetails(companyId: string, linkedUserId: string) {
  const [user, business, taxConfig, thresholdStatus, companyRow] =
    await Promise.all([
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
    prisma.company.findFirst({
      where: { id: companyId },
      select: { ownerId: true },
    }),
  ]);

  if (!user) return null;

  const [consultantConnection, filingsSummary, filingsRecent] =
    await Promise.all([
      companyRow?.ownerId != null
        ? prisma.consultantConnection.findFirst({
            where: {
              consultantUserId: companyRow.ownerId,
              userId: linkedUserId,
              status: "active",
            },
            select: { filingAuthorization: true },
          })
        : Promise.resolve(null),
      getFilingsSummary(linkedUserId),
      getRecentFilingsForClientConsultant(linkedUserId, 15),
    ]);

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
          pit: taxConfig.pit,
          stampDuties: taxConfig.stampDuties,
        }
      : null,
    vatThresholdStatus: thresholdStatus
      ? { status: thresholdStatus.status, message: thresholdStatus.message }
      : null,
    consultantLink: consultantConnection
      ? { filingAuthorization: consultantConnection.filingAuthorization }
      : null,
    /** Same as consultantLink.filingAuthorization; null if no active link. */
    filingAuthorization: consultantConnection?.filingAuthorization ?? null,
    filings: {
      summary: filingsSummary,
      recent: filingsRecent,
    },
  };
}
