import { prisma } from "../../config/database";
import { isValidCustomerDocumentType } from "../../constants/directory";
import {
  isInvoicePaymentType,
  isSalePaidStatus,
  resolveSaleInvoiceStatus,
  SALE_STATUS,
} from "../../constants/salePaymentRules";
import { coerceInvoiceAmountPaid } from "../../constants/invoiceAmountPaid";
import { nextDisplayCode } from "../../utils/codeGenerator";
import { HttpReplyError } from "../../utils/httpReplyError";
import {
  formatYmd,
  summarizeSalesForReceivable,
} from "../../utils/transactionSummaryHelper";
import { normalizeMoneyAmount } from "../../utils/monetaryAmount";
import { Decimal } from "@prisma/client/runtime/library";

const CUSTOMER_COUNTER = "customer_code";

function d(v: Decimal | number | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === "object" && typeof v.toNumber === "function") {
    return v.toNumber();
  }
  return Number(v);
}

async function findCustomer(userId: string, customerIdOrCode: string) {
  return prisma.customer.findFirst({
    where: {
      userId,
      OR: [{ id: customerIdOrCode }, { customerCode: customerIdOrCode }],
    },
  });
}

function mapSaleRow(s: {
  id: string;
  invoiceNumber: string;
  description: string;
  totalAmount: Decimal;
  paymentType: string;
  status: string;
  saleDate: Date;
  customerName: string | null;
  customerId: string | null;
}) {
  return {
    id: s.invoiceNumber,
    uuid: s.id,
    description: s.description,
    totalAmount: d(s.totalAmount),
    paymentType: s.paymentType,
    status: resolveSaleInvoiceStatus(s),
    date: formatYmd(s.saleDate),
    customer: s.customerId
      ? { id: s.customerId, name: s.customerName ?? "" }
      : null,
  };
}

async function customerSales(userId: string, customerCode: string) {
  return prisma.sale.findMany({
    where: { userId, customerId: customerCode },
    orderBy: [{ saleDate: "desc" }, { createdAt: "desc" }],
  });
}

function customerListMetrics(
  sales: Awaited<ReturnType<typeof customerSales>>,
) {
  const summary = summarizeSalesForReceivable(sales);
  let lastTransactionDate: string | null = null;
  if (sales.length > 0) {
    lastTransactionDate = formatYmd(sales[0]!.saleDate);
  }
  return {
    totalSalesAmount: summary.totalSalesAmount,
    outstandingBalance: summary.outstandingReceivable,
    lastTransactionDate,
  };
}

export const customersService = {
  async create(
    userId: string,
    data: {
      name: string;
      phone: string;
      address: string;
      businessName?: string;
      email?: string;
      tin?: string;
    },
  ) {
    const customerCode = await nextDisplayCode(CUSTOMER_COUNTER, "CUS");
    const row = await prisma.customer.create({
      data: {
        userId,
        customerCode,
        name: data.name.trim(),
        phone: data.phone.trim(),
        address: data.address.trim(),
        businessName: data.businessName?.trim() || null,
        email: data.email?.trim() || null,
        tin: data.tin?.trim() || null,
        status: "ACTIVE",
      },
    });
    return {
      id: row.customerCode,
      uuid: row.id,
      name: row.name,
      phone: row.phone,
      address: row.address,
      businessName: row.businessName,
      email: row.email,
      tin: row.tin,
      status: row.status,
      dateAdded: formatYmd(row.createdAt),
    };
  },

  async update(
    userId: string,
    customerIdOrCode: string,
    data: {
      name?: string;
      phone?: string;
      address?: string;
      businessName?: string | null;
      email?: string | null;
      tin?: string | null;
    },
  ) {
    const row = await findCustomer(userId, customerIdOrCode);
    if (!row) throw new HttpReplyError(404, "Customer not found");

    const updated = await prisma.customer.update({
      where: { id: row.id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.phone !== undefined ? { phone: data.phone.trim() } : {}),
        ...(data.address !== undefined ? { address: data.address.trim() } : {}),
        ...(data.businessName !== undefined
          ? { businessName: data.businessName?.trim() || null }
          : {}),
        ...(data.email !== undefined
          ? { email: data.email?.trim() || null }
          : {}),
        ...(data.tin !== undefined ? { tin: data.tin?.trim() || null } : {}),
      },
    });

    return {
      id: updated.customerCode,
      uuid: updated.id,
      name: updated.name,
      phone: updated.phone,
      address: updated.address,
      businessName: updated.businessName,
      email: updated.email,
      tin: updated.tin,
      status: updated.status,
      dateAdded: formatYmd(updated.createdAt),
    };
  },

  async getById(userId: string, customerIdOrCode: string) {
    const row = await findCustomer(userId, customerIdOrCode);
    if (!row) throw new HttpReplyError(404, "Customer not found");

    const [sales, documents] = await Promise.all([
      customerSales(userId, row.customerCode),
      prisma.customerDocument.findMany({
        where: { customerId: row.id },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const metrics = customerListMetrics(sales);

    return {
      id: row.customerCode,
      uuid: row.id,
      name: row.name,
      businessName: row.businessName,
      phone: row.phone,
      email: row.email,
      tin: row.tin,
      address: row.address,
      status: row.status,
      dateAdded: formatYmd(row.createdAt),
      lastTransactionDate: metrics.lastTransactionDate,
      receivableSummary: summarizeSalesForReceivable(sales),
      sales: sales.map(mapSaleRow),
      documents: documents.map((doc) => ({
        id: doc.id,
        saleId: doc.saleId,
        type: doc.type,
        url: doc.url,
        createdAt: doc.createdAt.toISOString(),
      })),
    };
  },

  async dashboard(userId: string) {
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const monthEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );

    const [customers, allSales] = await Promise.all([
      prisma.customer.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.sale.findMany({ where: { userId } }),
    ]);

    const salesByCustomer = new Map<string, typeof allSales>();
    for (const s of allSales) {
      if (!s.customerId) continue;
      const list = salesByCustomer.get(s.customerId) ?? [];
      list.push(s);
      salesByCustomer.set(s.customerId, list);
    }

    const customerRows = customers.map((c) => {
      const sales = salesByCustomer.get(c.customerCode) ?? [];
      const metrics = customerListMetrics(sales);
      return {
        id: c.customerCode,
        name: c.name,
        businessName: c.businessName,
        phone: c.phone,
        email: c.email,
        status: c.status,
        totalSalesAmount: metrics.totalSalesAmount,
        outstandingBalance: metrics.outstandingBalance,
        lastTransactionDate: metrics.lastTransactionDate,
      };
    });

    const newCustomersThisMonth = customers.filter(
      (c) => c.createdAt >= monthStart && c.createdAt < monthEnd,
    ).length;

    const activeCustomers = customers.filter((c) => c.status === "ACTIVE")
      .length;

    const customersWithOutstandingBalances = customerRows.filter(
      (c) => c.outstandingBalance > 0,
    ).length;

    const topCustomers = [...customerRows]
      .sort((a, b) => b.totalSalesAmount - a.totalSalesAmount)
      .slice(0, 5);

    const upcomingCustomerPayments = allSales
      .filter((s) => {
        if (!isInvoicePaymentType(s.paymentType)) return false;
        const resolved = resolveSaleInvoiceStatus(s);
        if (isSalePaidStatus(resolved) || resolved === SALE_STATUS.CANCELLED) {
          return false;
        }
        if (!s.invoiceDueDate) return false;
        return s.invoiceDueDate >= now;
      })
      .map((s) => {
        const total = d(s.totalAmount);
        const paid = coerceInvoiceAmountPaid(s.invoiceAmountPaid).total;
        return {
          customerId: s.customerId,
          customerName: s.customerName,
          invoiceNumber: s.invoiceNumber,
          dueDate: formatYmd(s.invoiceDueDate),
          amountDue: normalizeMoneyAmount(Math.max(0, total - paid)),
        };
      })
      .slice(0, 20);

    return {
      totalCustomers: customers.length,
      newCustomersThisMonth,
      activeCustomers,
      customersWithOutstandingBalances,
      topCustomers,
      upcomingCustomerPayments,
      customers: customerRows,
    };
  },

  async uploadDocument(
    userId: string,
    customerIdOrCode: string,
    data: { saleId: string; type: string; url: string },
  ) {
    const customer = await findCustomer(userId, customerIdOrCode);
    if (!customer) throw new HttpReplyError(404, "Customer not found");
    if (!isValidCustomerDocumentType(data.type)) {
      throw new HttpReplyError(400, "Invalid customer document type");
    }

    const sale = await prisma.sale.findFirst({
      where: {
        userId,
        OR: [{ id: data.saleId }, { invoiceNumber: data.saleId }],
      },
    });
    if (!sale) throw new HttpReplyError(404, "Sale not found");
    if (sale.customerId && sale.customerId !== customer.customerCode) {
      throw new HttpReplyError(
        400,
        "Sale does not belong to this customer",
      );
    }

    const doc = await prisma.customerDocument.create({
      data: {
        userId,
        customerId: customer.id,
        saleId: sale.invoiceNumber,
        type: data.type,
        url: data.url.trim(),
      },
    });

    return {
      id: doc.id,
      saleId: doc.saleId,
      type: doc.type,
      url: doc.url,
      createdAt: doc.createdAt.toISOString(),
    };
  },
};
