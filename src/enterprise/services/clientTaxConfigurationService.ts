import { prisma } from "../../config/database";

export type TaxConfigurationUpdate = {
  vat?: boolean;
  paye?: boolean;
  wht?: boolean;
  cit?: boolean;
  stampDuties?: boolean;
};

export async function upsertTaxConfiguration(
  companyId: string,
  data: TaxConfigurationUpdate,
) {
  return prisma.clientTaxConfiguration.upsert({
    where: { companyId },
    create: {
      companyId,
      vat: data.vat ?? false,
      paye: data.paye ?? false,
      wht: data.wht ?? false,
      cit: data.cit ?? false,
      stampDuties: data.stampDuties ?? false,
    },
    update: {
      ...(data.vat !== undefined && { vat: data.vat }),
      ...(data.paye !== undefined && { paye: data.paye }),
      ...(data.wht !== undefined && { wht: data.wht }),
      ...(data.cit !== undefined && { cit: data.cit }),
      ...(data.stampDuties !== undefined && { stampDuties: data.stampDuties }),
    },
  });
}
