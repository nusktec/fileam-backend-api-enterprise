import { prisma } from "../config/database";
import { enterpriseBusinessProfileService } from "../enterprise/services/enterpriseBusinessProfileService";
import { enterpriseFinancialsService } from "../enterprise/services/enterpriseFinancialsService";
import { enterpriseTaxComputationService } from "../enterprise/services/enterpriseTaxComputationService";
import { EXPENSE_CATEGORIES } from "../constants/expenseCategories";
import { EXPENSE_TYPES } from "../constants/expenseTypes";
import { REPORT_TYPES } from "../constants/filings";
import { EMPLOYMENT_TYPES } from "../constants/employmentTypes";
import { SALE_CATEGORIES } from "../constants/saleCategories";

const PAYMENT_TYPES = ["Cash", "Transfer", "Invoice", "Card"] as const;

export interface AllTypes {
  businessTypes: string[];
  industries: string[];
  documentTypes: string[];
  currencies: string[];
  vatTypes: string[];
  vatPeriods: string[];
  reportTypes: { id: string; name: string }[];
  expenseCategories: string[];
  expenseTypes: string[];
  paymentTypes: string[];
  employmentTypes: string[];
  saleCategories: string[];
}

export const contactsAndTypesService = {
  getAllTypes(): AllTypes {
    return {
      businessTypes: enterpriseBusinessProfileService.getBusinessTypes(),
      industries: enterpriseBusinessProfileService.getIndustries(),
      documentTypes: enterpriseFinancialsService.getDocumentTypes(),
      currencies: enterpriseFinancialsService.getCurrencies(),
      vatTypes: enterpriseTaxComputationService.getVatTypes(),
      vatPeriods: enterpriseTaxComputationService.getVatPeriods(),
      reportTypes: REPORT_TYPES.map((t) => ({ id: t, name: t })),
      expenseCategories: [...EXPENSE_CATEGORIES],
      expenseTypes: [...EXPENSE_TYPES],
      paymentTypes: [...PAYMENT_TYPES],
      employmentTypes: [...EMPLOYMENT_TYPES],
      saleCategories: [...SALE_CATEGORIES],
    };
  },

  async getContactsForEnterprise(consultantUserId: string) {
    const { enterpriseClientsService } = await import(
      "../enterprise/services/enterpriseClientsService"
    );
    return enterpriseClientsService.listClients(consultantUserId, undefined, {
      type: "all",
    });
  },

  async getContactsForMobile(userId: string): Promise<string[]> {
    const sales = await prisma.sale.findMany({
      where: { userId },
      select: { customerName: true },
      distinct: ["customerName"],
    });
    return sales
      .map((s) => s.customerName?.trim())
      .filter((name): name is string => Boolean(name))
      .sort((a, b) => a.localeCompare(b));
  },
};
