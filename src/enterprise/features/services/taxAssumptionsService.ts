import { prisma } from "../../../config/database";
import { HttpReplyError } from "../../../utils/httpReplyError";
import { HttpStatusCode } from "../../../interfaces/system";
import { VAT_REGISTRATION_STATUSES } from "../constants";
import { canAccessClient } from "../../services/enterpriseManagedEntitiesService";

export const featuresTaxAssumptionsService = {
  async update(
    consultantUserId: string,
    clientId: string,
    patch: {
      vatRegistrationStatus?: string;
      applicationCitRate?: number;
      msmeExemptionEligible?: boolean;
    },
  ) {
    const access = await canAccessClient(consultantUserId, clientId);
    if (!access.allowed || !access.linkedUserId) {
      throw new HttpReplyError(
        HttpStatusCode.NOT_FOUND,
        "Client not found or access denied.",
      );
    }

    if (
      patch.vatRegistrationStatus != null &&
      !VAT_REGISTRATION_STATUSES.includes(
        patch.vatRegistrationStatus as (typeof VAT_REGISTRATION_STATUSES)[number],
      )
    ) {
      throw new HttpReplyError(
        HttpStatusCode.BAD_REQUEST,
        'vatRegistrationStatus must be "registered", "not-registered", or "exempt"',
      );
    }
    if (
      patch.applicationCitRate != null &&
      (!Number.isFinite(patch.applicationCitRate) ||
        patch.applicationCitRate < 0 ||
        patch.applicationCitRate > 100)
    ) {
      throw new HttpReplyError(
        HttpStatusCode.BAD_REQUEST,
        "applicationCitRate must be a percentage between 0 and 100",
      );
    }

    const existing = await prisma.clientTaxAssumptions.findUnique({
      where: { clientUserId: access.linkedUserId },
    });

    const data = {
      vatRegistrationStatus:
        patch.vatRegistrationStatus ??
        existing?.vatRegistrationStatus ??
        "not-registered",
      applicationCitRate:
        patch.applicationCitRate ?? existing?.applicationCitRate ?? 30,
      msmeExemptionEligible:
        patch.msmeExemptionEligible ??
        existing?.msmeExemptionEligible ??
        false,
      companyId: access.companyId ?? existing?.companyId ?? null,
    };

    const updated = await prisma.clientTaxAssumptions.upsert({
      where: { clientUserId: access.linkedUserId },
      create: {
        clientUserId: access.linkedUserId,
        ...data,
      },
      update: data,
    });

    return {
      clientId,
      assumptions: {
        vatRegistrationStatus: updated.vatRegistrationStatus,
        applicationCitRate: updated.applicationCitRate,
        msmeExemptionEligible: updated.msmeExemptionEligible,
      },
      updatedAt: updated.updatedAt.toISOString(),
    };
  },
};
