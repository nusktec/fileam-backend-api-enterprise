import { prisma } from "../../config/database";

export const filingTaxTypeService = {
  async listForApi(includeInactive: boolean) {
    return prisma.filingTaxTypeOption.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      select: {
        id: true,
        code: true,
        label: true,
        sortOrder: true,
        isActive: true,
      },
    });
  },

  async getActiveCodes(): Promise<string[]> {
    const rows = await prisma.filingTaxTypeOption.findMany({
      where: { isActive: true },
      select: { code: true },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    });
    return rows.map((r) => r.code);
  },

  async isActiveCode(code: string): Promise<boolean> {
    const row = await prisma.filingTaxTypeOption.findFirst({
      where: { code: code.toUpperCase(), isActive: true },
    });
    return !!row;
  },

  async bulkUpdate(
    items: Array<{
      id: string;
      label?: string;
      sortOrder?: number;
      isActive?: boolean;
    }>,
  ) {
    for (const item of items) {
      const data: {
        label?: string;
        sortOrder?: number;
        isActive?: boolean;
      } = {};
      if (item.label !== undefined) data.label = item.label;
      if (item.sortOrder !== undefined) data.sortOrder = item.sortOrder;
      if (item.isActive !== undefined) data.isActive = item.isActive;
      if (Object.keys(data).length === 0) continue;
      await prisma.filingTaxTypeOption.update({
        where: { id: item.id },
        data,
      });
    }
  },
};
