import { adminDashboardService } from "./adminDashboardService";
import { adminListService, type AdminListOpts } from "./adminListService";
import { toCsv } from "../utils/csv";

const EXPORT_PAGE_SIZE = 500;
const MAX_EXPORT_ROWS = 10_000;

async function fetchAllPages<T>(
  fetchPage: (page: number) => Promise<{ data: T[]; totalPages: number }>,
): Promise<T[]> {
  const out: T[] = [];
  let page = 1;
  while (out.length < MAX_EXPORT_ROWS) {
    const result = await fetchPage(page);
    out.push(...result.data);
    if (page >= result.totalPages || result.data.length === 0) break;
    page += 1;
  }
  return out.slice(0, MAX_EXPORT_ROWS);
}

function listOpts(base: Omit<AdminListOpts, "page" | "limit">): AdminListOpts {
  return { ...base, page: 1, limit: EXPORT_PAGE_SIZE, sortOrder: base.sortOrder ?? "desc" };
}

export const adminExportService = {
  async exportUsers(base: Omit<AdminListOpts, "page" | "limit">) {
    const rows = await fetchAllPages((page) =>
      adminListService.listUsers({ ...listOpts(base), page }),
    );
    return toCsv(
      [
        "id",
        "email",
        "firstName",
        "lastName",
        "verified",
        "onboardingComplete",
        "enterpriseOnboardingComplete",
        "taxPersona",
        "organizationName",
        "requestDelete",
        "roles",
        "createdAt",
      ],
      rows.map((r) => [
        r.id,
        r.email,
        r.firstName,
        r.lastName,
        r.verified,
        r.onboardingComplete,
        r.enterpriseOnboardingComplete,
        r.taxPersona,
        r.organizationName,
        r.requestDelete,
        r.roles.join("; "),
        r.createdAt,
      ]),
    );
  },

  async exportCompanies(base: Omit<AdminListOpts, "page" | "limit">) {
    const rows = await fetchAllPages((page) =>
      adminListService.listCompanies({ ...listOpts(base), page }),
    );
    return toCsv(
      ["id", "name", "ownerEmail", "linkedClientEmail", "managedClients", "createdAt"],
      rows.map((r) => [
        r.id,
        r.name,
        r.owner?.email,
        r.linkedUser?.email,
        r.managedClientCount,
        r.createdAt,
      ]),
    );
  },

  async exportSales(base: Omit<AdminListOpts, "page" | "limit">) {
    const rows = await fetchAllPages((page) =>
      adminListService.listSales({ ...listOpts(base), page }),
    );
    return toCsv(
      [
        "id",
        "userEmail",
        "invoiceNumber",
        "customerName",
        "itemName",
        "category",
        "description",
        "amount",
        "totalAmount",
        "status",
        "paymentType",
        "saleDate",
      ],
      rows.map((r) => [
        r.id,
        r.user?.email,
        r.invoiceNumber,
        r.customerName,
        r.itemName,
        r.category,
        r.description,
        r.amount,
        r.totalAmount,
        r.status,
        r.paymentType,
        r.saleDate,
      ]),
    );
  },

  async exportExpenses(base: Omit<AdminListOpts, "page" | "limit">) {
    const rows = await fetchAllPages((page) =>
      adminListService.listExpenses({ ...listOpts(base), page }),
    );
    return toCsv(
      [
        "id",
        "userEmail",
        "expenseNumber",
        "category",
        "description",
        "supplierName",
        "totalAmount",
        "expenseDate",
      ],
      rows.map((r) => [
        r.id,
        r.user?.email,
        r.expenseNumber,
        r.category,
        r.description,
        r.supplierName,
        r.totalAmount,
        r.expenseDate,
      ]),
    );
  },

  async exportTaxPayables(base: Omit<AdminListOpts, "page" | "limit">) {
    const rows = await fetchAllPages((page) =>
      adminListService.listTaxPayables({ ...listOpts(base), page }),
    );
    return toCsv(
      [
        "id",
        "userEmail",
        "taxType",
        "periodYear",
        "periodMonth",
        "amountDue",
        "totalPayable",
        "status",
        "filingDueDate",
      ],
      rows.map((r) => [
        r.id,
        r.user?.email,
        r.taxType,
        r.periodYear,
        r.periodMonth,
        r.amountDue,
        r.totalPayable,
        r.status,
        r.filingDueDate,
      ]),
    );
  },

  async exportInvitations(base: Omit<AdminListOpts, "page" | "limit">) {
    const rows = await fetchAllPages((page) =>
      adminListService.listInvitations({ ...listOpts(base), page }),
    );
    return toCsv(
      [
        "id",
        "invitedEmail",
        "invitedContactName",
        "status",
        "initiator",
        "senderType",
        "consultantEmail",
        "createdAt",
      ],
      rows.map((r) => [
        r.id,
        r.invitedEmail,
        r.invitedContactName,
        r.status,
        r.initiator,
        r.senderType,
        r.consultant?.email,
        r.createdAt,
      ]),
    );
  },

  async exportConsultantOnboarding(base: Omit<AdminListOpts, "page" | "limit">) {
    const rows = await fetchAllPages((page) =>
      adminListService.listConsultantOnboarding({ ...listOpts(base), page }),
    );
    return toCsv(
      ["id", "userEmail", "userFirstName", "userLastName", "status", "currentStep", "createdAt"],
      rows.map((r) => [
        r.id,
        r.user?.email,
        r.user?.firstName,
        r.user?.lastName,
        r.status,
        r.currentStep,
        r.createdAt,
      ]),
    );
  },

  async exportMetricsSummary() {
    const m = await adminDashboardService.getMetrics();
    return toCsv(
      ["category", "metric", "value"],
      [
        ["Users", "Total", m.users.total],
        ["Users", "Verified", m.users.verified],
        ["Users", "Onboarding complete", m.users.onboardingComplete],
        ["Users", "Deletion requests", m.users.accountDeletionRequests],
        ["Consultants", "Onboarded", m.consultants.onboarded],
        ["Consultants", "Companies", m.consultants.companies],
        ["Consultants", "Linked clients", m.consultants.linkedClients],
        ["Consultants", "Active connections", m.consultants.activeConnections],
        ["Consultants", "Pending invitations", m.consultants.pendingInvitations],
        ["Usage", "Sales transactions", m.usage.salesCount],
        ["Usage", "Expense transactions", m.usage.expensesCount],
        ["Usage", "Net platform volume", m.usage.netPlatformVolume],
        ["Usage", "Tax payables pending", m.usage.taxPayablesPending],
        ["Sales", "Total volume", m.sales.totalVolume],
        ["Sales", "Total count", m.sales.totalCount],
        ["Sales", "Volume this month", m.sales.volumeThisMonth],
        ["Sales", "Count this month", m.sales.countThisMonth],
        ["Onboarding", "Users onboarded", m.onboarding.usersOnboarded],
        ["Onboarding", "Consultant reviews pending", m.onboarding.consultantPending],
        ["Onboarding", "Invitations pending", m.onboarding.invitationsPending],
      ],
    );
  },
};
