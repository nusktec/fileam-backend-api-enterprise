import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import {
  PAYER_DOCUMENT_CATEGORY_LABELS,
  PAYER_CATEGORY_LABELS,
  PAYER_INVOICE_COUNTER,
  PAYER_PURPOSE_LABELS,
  PAYER_DOCUMENT_KINDS,
  computePayerStatus,
  defaultPayerBeneficiary,
  payerTaxDefaults,
  resolvePayerDisplayName,
  type PayerDocumentKind,
  type PayerEntityType,
  type PayerIncomeCategory,
  type PayerListFilter,
  type PayerPaymentPurpose,
  type PayerPaymentType,
  type PayerTransactionStatus,
} from "../../constants/payer";
import {
  buildInvoiceAmountPaid,
  coerceInvoiceAmountPaid,
  EMPTY_INVOICE_AMOUNT_PAID,
  invoiceAmountPaidFromSingle,
  sumInvoiceAmountPaidItems,
  type InvoiceAmountPaid,
} from "../../constants/invoiceAmountPaid";
import { nextDisplayCode } from "../../utils/codeGenerator";
import { HttpReplyError } from "../../utils/httpReplyError";
import { ledgerPostingService } from "../../services/ledgerPostingService";
import { normalizeMoneyAmount } from "../../utils/monetaryAmount";
import { formatTodayYmd } from "../../constants/employer";

function d(v: Decimal | number | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === "object" && typeof v.toNumber === "function") {
    return v.toNumber();
  }
  return Number(v);
}

function todayYmd(): string {
  return formatTodayYmd();
}

function resolveInitialTxnStatus(
  paymentType: PayerPaymentType,
  invoiceDueDate: string | null,
): PayerTransactionStatus {
  if (paymentType !== "Invoice") return "PAID";
  const today = todayYmd();
  if (invoiceDueDate && invoiceDueDate < today) return "OVERDUE";
  return "OUTSTANDING";
}

function amountRemaining(amount: number, paid: InvoiceAmountPaid): number {
  return normalizeMoneyAmount(amount - paid.total);
}

function mapTransactionRow(row: {
  id: string;
  payerId: string;
  title: string;
  date: string;
  invoiceNumber: string;
  amount: Decimal;
  status: string;
  paymentType: string;
  purpose: string;
  paymentReference: string | null;
  notes: string | null;
  invoiceDueDate: string | null;
  invoiceAmountPaid: unknown;
  createdAt: Date;
}) {
  const amount = d(row.amount);
  const paid = coerceInvoiceAmountPaid(row.invoiceAmountPaid);
  return {
    id: row.id,
    payerId: row.payerId,
    title: row.title,
    date: row.date,
    invoiceNumber: row.invoiceNumber,
    amount,
    status: row.status,
    paymentType: row.paymentType,
    purpose: row.purpose,
    paymentReference: row.paymentReference,
    notes: row.notes,
    invoiceDueDate: row.invoiceDueDate,
    invoiceAmountPaid: paid,
    amountPaid: paid.total,
    amountRemaining: amountRemaining(amount, paid),
    createdAt: row.createdAt.toISOString(),
  };
}

function computePayerRollups(
  transactions: Array<{
    amount: Decimal;
    status: string;
    paymentType: string;
    invoiceDueDate: string | null;
    invoiceAmountPaid: unknown;
    date: string;
  }>,
) {
  let totalAmount = 0;
  let arBalance = 0;
  let overdueAmount = 0;
  let lastTransactionDate: string | null = null;

  for (const t of transactions) {
    if (t.status === "VOID") continue;
    const amount = d(t.amount);
    totalAmount = normalizeMoneyAmount(totalAmount + amount);
    if (!lastTransactionDate || t.date > lastTransactionDate) {
      lastTransactionDate = t.date;
    }

    if (t.paymentType === "Invoice") {
      const paid = coerceInvoiceAmountPaid(t.invoiceAmountPaid);
      const remaining = amountRemaining(amount, paid);
      if (remaining > 0 && (t.status === "OUTSTANDING" || t.status === "OVERDUE")) {
        arBalance = normalizeMoneyAmount(arBalance + remaining);
        if (t.status === "OVERDUE") {
          overdueAmount = normalizeMoneyAmount(overdueAmount + remaining);
        }
      }
    }
  }

  return {
    totalAmount,
    arBalance,
    overdueAmount,
    status: computePayerStatus(arBalance, overdueAmount),
    lastTransactionDate,
  };
}

async function refreshOverdueStatuses(payerId: string) {
  const today = todayYmd();
  const rows = await prisma.payerTransaction.findMany({
    where: {
      payerId,
      paymentType: "Invoice",
      status: { in: ["OUTSTANDING", "OVERDUE"] },
    },
  });

  for (const row of rows) {
    const paid = coerceInvoiceAmountPaid(row.invoiceAmountPaid);
    const remaining = amountRemaining(d(row.amount), paid);
    if (remaining <= 0) {
      if (row.status !== "PAID") {
        await prisma.payerTransaction.update({
          where: { id: row.id },
          data: { status: "PAID" },
        });
      }
      continue;
    }
    const shouldBeOverdue =
      row.invoiceDueDate != null && row.invoiceDueDate < today;
    const nextStatus = shouldBeOverdue ? "OVERDUE" : "OUTSTANDING";
    if (row.status !== nextStatus) {
      await prisma.payerTransaction.update({
        where: { id: row.id },
        data: { status: nextStatus },
      });
    }
  }
}

async function findOwnedPayer(userId: string, payerId: string) {
  const payer = await prisma.payer.findFirst({
    where: { id: payerId, userId },
  });
  if (!payer) {
    throw new HttpReplyError(404, "Payer not found");
  }
  return payer;
}

function mapPayerBase(
  payer: {
    id: string;
    name: string;
    entityType: string;
    category: string;
    beneficiary: string | null;
    contactPerson: string;
    tin: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    bankName: string | null;
    bankAccount: string | null;
    vatApplicable: boolean;
    vatRate: Decimal;
    whtApplicable: boolean;
    whtRate: Decimal;
    whtNote: string | null;
    since: string;
    createdAt: Date;
    updatedAt: Date;
  },
  rollups: ReturnType<typeof computePayerRollups>,
) {
  return {
    id: payer.id,
    name: payer.name,
    entityType: payer.entityType,
    category: payer.category.trim().toLowerCase(),
    beneficiary: payer.beneficiary,
    contactPerson: payer.contactPerson,
    tin: payer.tin,
    phone: payer.phone,
    email: payer.email,
    address: payer.address,
    bankName: payer.bankName,
    bankAccount: payer.bankAccount,
    vatApplicable: payer.vatApplicable,
    vatRate: d(payer.vatRate),
    whtApplicable: payer.whtApplicable,
    whtRate: d(payer.whtRate),
    whtNote: payer.whtNote,
    since: payer.since,
    lastTransactionDate: rollups.lastTransactionDate,
    totalAmount: rollups.totalAmount,
    arBalance: rollups.arBalance,
    overdueAmount: rollups.overdueAmount,
    status: rollups.status,
    createdAt: payer.createdAt.toISOString(),
    updatedAt: payer.updatedAt.toISOString(),
  };
}

function mapDocument(row: {
  id: string;
  payerId: string;
  title: string;
  kind: string;
  categoryLabel: string;
  date: string | null;
  url: string | null;
  linked: boolean;
  required: boolean;
  createdAt: Date;
}) {
  return {
    id: row.id,
    payerId: row.payerId,
    title: row.title,
    kind: row.kind,
    categoryLabel: row.categoryLabel,
    date: row.date,
    url: row.url,
    linked: row.linked,
    required: row.required,
    createdAt: row.createdAt.toISOString(),
  };
}

export const payersService = {
  async create(
    userId: string,
    body: {
      entityType: PayerEntityType;
      fullName: string;
      companyName?: string;
      tin?: string;
      category: PayerIncomeCategory;
      vatApplicable?: boolean;
      whtApplicable?: boolean;
      phone?: string;
      email?: string;
      address?: string;
      bankName?: string;
      bankAccount?: string;
      beneficiary?: string;
      evidence?: { url: string; name?: string };
    },
  ) {
    const vatApplicable = body.vatApplicable ?? false;
    const whtApplicable = body.whtApplicable ?? false;
    const tax = payerTaxDefaults(vatApplicable, whtApplicable);
    const beneficiary =
      body.beneficiary ??
      defaultPayerBeneficiary(body.entityType);
    const name = resolvePayerDisplayName({
      entityType: body.entityType,
      fullName: body.fullName,
      companyName: body.companyName,
    });

    const payer = await prisma.payer.create({
      data: {
        userId,
        name,
        entityType: body.entityType,
        category: body.category,
        beneficiary,
        contactPerson: body.fullName.trim(),
        tin: body.tin?.trim() || null,
        phone: body.phone?.trim() || null,
        email: body.email?.trim() || null,
        address: body.address?.trim() || null,
        bankName: body.bankName?.trim() || null,
        bankAccount: body.bankAccount?.trim() || null,
        vatApplicable,
        vatRate: tax.vatRate,
        whtApplicable,
        whtRate: tax.whtRate,
        whtNote: tax.whtNote,
        since: todayYmd(),
        documents: body.evidence?.url
          ? {
              create: {
                title: body.evidence.name?.trim() || "Uploaded document",
                kind: "OTHER",
                categoryLabel: "Supporting Document",
                date: todayYmd(),
                url: body.evidence.url,
                linked: true,
                required: false,
              },
            }
          : undefined,
      },
    });

    const rollups = computePayerRollups([]);
    return mapPayerBase(payer, rollups);
  },

  async update(
    userId: string,
    payerId: string,
    body: Partial<{
      entityType: PayerEntityType;
      fullName: string;
      companyName: string | null;
      tin: string | null;
      category: PayerIncomeCategory;
      vatApplicable: boolean;
      whtApplicable: boolean;
      phone: string | null;
      email: string | null;
      address: string | null;
      bankName: string | null;
      bankAccount: string | null;
      beneficiary: string | null;
    }>,
  ) {
    const existing = await findOwnedPayer(userId, payerId);
    const entityType = (body.entityType ??
      existing.entityType) as PayerEntityType;
    const fullName = body.fullName?.trim() ?? existing.contactPerson;
    const companyName =
      body.companyName !== undefined ? body.companyName : undefined;
    const vatApplicable = body.vatApplicable ?? existing.vatApplicable;
    const whtApplicable = body.whtApplicable ?? existing.whtApplicable;
    const tax = payerTaxDefaults(vatApplicable, whtApplicable);

    const payer = await prisma.payer.update({
      where: { id: payerId },
      data: {
        entityType: body.entityType ?? undefined,
        name: resolvePayerDisplayName({
          entityType,
          fullName,
          companyName:
            companyName !== undefined
              ? companyName
              : entityType === "COMPANY"
                ? existing.name
                : null,
        }),
        contactPerson: body.fullName?.trim() ?? undefined,
        category: body.category ?? undefined,
        beneficiary: body.beneficiary ?? undefined,
        tin: body.tin !== undefined ? body.tin : undefined,
        phone: body.phone !== undefined ? body.phone : undefined,
        email: body.email !== undefined ? body.email : undefined,
        address: body.address !== undefined ? body.address : undefined,
        bankName: body.bankName !== undefined ? body.bankName : undefined,
        bankAccount:
          body.bankAccount !== undefined ? body.bankAccount : undefined,
        vatApplicable,
        whtApplicable,
        vatRate: tax.vatRate,
        whtRate: tax.whtRate,
        whtNote: tax.whtNote,
      },
    });

    await refreshOverdueStatuses(payerId);
    const transactions = await prisma.payerTransaction.findMany({
      where: { payerId },
    });
    return mapPayerBase(payer, computePayerRollups(transactions));
  },

  async list(
    userId: string,
    query: {
      status?: PayerListFilter;
      search?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 50));
    const allPayers = await prisma.payer.findMany({
      where: { userId },
      include: { transactions: true },
      orderBy: { createdAt: "desc" },
    });

    const enriched = [];
    for (const p of allPayers) {
      await refreshOverdueStatuses(p.id);
      const txns = await prisma.payerTransaction.findMany({
        where: { payerId: p.id },
      });
      const rollups = computePayerRollups(txns);
      enriched.push({ payer: p, rollups });
    }

    const summary = {
      arOutstanding: normalizeMoneyAmount(
        enriched.reduce((s, e) => s + e.rollups.arBalance, 0),
      ),
      overdueCount: enriched.filter((e) => e.rollups.status === "OVERDUE")
        .length,
      payerCount: enriched.length,
    };

    let filtered = enriched;
    if (query.status === "AR_BALANCE") {
      filtered = enriched.filter((e) => e.rollups.arBalance > 0);
    } else if (query.status === "OVERDUE") {
      filtered = enriched.filter((e) => e.rollups.status === "OVERDUE");
    }

    if (query.search?.trim()) {
      const q = query.search.trim().toLowerCase();
      filtered = filtered.filter((e) => {
        const categoryLabel =
          PAYER_CATEGORY_LABELS[
            e.payer.category as keyof typeof PAYER_CATEGORY_LABELS
          ] ?? e.payer.category;
        return (
          e.payer.name.toLowerCase().includes(q) ||
          e.payer.contactPerson.toLowerCase().includes(q) ||
          categoryLabel.toLowerCase().includes(q)
        );
      });
    }

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const slice = filtered.slice((page - 1) * limit, page * limit);

    return {
      summary,
      payers: slice.map(({ payer, rollups }) => ({
        id: payer.id,
        name: payer.name,
        entityType: payer.entityType,
        category: payer.category,
        contactPerson: payer.contactPerson,
        totalAmount: rollups.totalAmount,
        arBalance: rollups.arBalance,
        overdueAmount: rollups.overdueAmount,
        status: rollups.status,
        lastTransactionDate: rollups.lastTransactionDate,
      })),
      total,
      page,
      limit,
      totalPages,
    };
  },

  async getById(userId: string, payerId: string, nested = true) {
    const payer = await findOwnedPayer(userId, payerId);
    await refreshOverdueStatuses(payerId);
    const transactions = await prisma.payerTransaction.findMany({
      where: { payerId },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
    const documents = await prisma.payerDocument.findMany({
      where: {
        payerId,
        OR: [{ linked: true }, { url: { not: null } }],
      },
      orderBy: { createdAt: "desc" },
    });
    const rollups = computePayerRollups(transactions);
    const base = mapPayerBase(payer, rollups);
    if (!nested) return base;
    return {
      ...base,
      transactions: transactions.map(mapTransactionRow),
      documents: documents.map(mapDocument),
    };
  },

  async createTransaction(
    userId: string,
    payerId: string,
    body: {
      date: string;
      amount: number;
      paymentType: PayerPaymentType;
      invoiceDueDate?: string | null;
      purpose: PayerPaymentPurpose;
      paymentReference?: string;
      notes?: string;
    },
  ) {
    await findOwnedPayer(userId, payerId);
    const amount = normalizeMoneyAmount(body.amount);
    if (amount <= 0) {
      throw new HttpReplyError(400, "Amount must be greater than zero");
    }

    if (body.paymentType === "Invoice") {
      if (!body.invoiceDueDate) {
        throw new HttpReplyError(400, "Invoice due date is required for Invoice payment type");
      }
      if (body.invoiceDueDate < body.date) {
        throw new HttpReplyError(400, "Invoice due date must be on or after transaction date");
      }
    } else if (body.invoiceDueDate) {
      throw new HttpReplyError(400, "invoiceDueDate must be null when payment type is not Invoice");
    }

    const invoiceNumber =
      body.paymentReference?.trim() ||
      (await nextDisplayCode(PAYER_INVOICE_COUNTER, "INV"));
    const title =
      body.notes?.trim() ||
      PAYER_PURPOSE_LABELS[body.purpose] ||
      body.purpose;
    const status = resolveInitialTxnStatus(
      body.paymentType,
      body.paymentType === "Invoice" ? (body.invoiceDueDate ?? null) : null,
    );
    const invoiceAmountPaid =
      body.paymentType === "Invoice"
        ? EMPTY_INVOICE_AMOUNT_PAID
        : invoiceAmountPaidFromSingle(amount, body.paymentType);

    const txn = await prisma.payerTransaction.create({
      data: {
        payerId,
        title,
        date: body.date,
        invoiceNumber,
        amount,
        status,
        paymentType: body.paymentType,
        purpose: body.purpose,
        paymentReference: body.paymentReference?.trim() || invoiceNumber,
        notes: body.notes?.trim() || null,
        invoiceDueDate:
          body.paymentType === "Invoice" ? (body.invoiceDueDate ?? null) : null,
        invoiceAmountPaid,
      },
    });

    await ledgerPostingService.postPayerRecognition(userId, {
      id: txn.id,
      paymentType: txn.paymentType,
      amount: d(txn.amount),
      date: txn.date,
    });

    return mapTransactionRow(txn);
  },

  async listTransactions(
    userId: string,
    payerId: string,
    query: { search?: string; status?: PayerTransactionStatus },
  ) {
    await findOwnedPayer(userId, payerId);
    await refreshOverdueStatuses(payerId);
    let rows = await prisma.payerTransaction.findMany({
      where: { payerId },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });

    if (query.status) {
      rows = rows.filter((r) => r.status === query.status);
    }
    if (query.search?.trim()) {
      const q = query.search.trim().toLowerCase();
      rows = rows.filter((r) =>
        [r.title, r.invoiceNumber, r.notes, r.paymentReference, r.purpose, r.paymentType, r.date]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      );
    }

    return { transactions: rows.map(mapTransactionRow) };
  },

  async listReceivables(userId: string, payerId: string) {
    await findOwnedPayer(userId, payerId);
    await refreshOverdueStatuses(payerId);
    const rows = await prisma.payerTransaction.findMany({
      where: {
        payerId,
        paymentType: "Invoice",
        status: { in: ["OUTSTANDING", "OVERDUE"] },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });

    let arBalance = 0;
    let overdueAmount = 0;
    const receivables = rows.map((row) => {
      const mapped = mapTransactionRow(row);
      if (mapped.amountRemaining > 0) {
        arBalance = normalizeMoneyAmount(arBalance + mapped.amountRemaining);
        if (row.status === "OVERDUE") {
          overdueAmount = normalizeMoneyAmount(
            overdueAmount + mapped.amountRemaining,
          );
        }
      }
      return mapped;
    });

    return { receivables, arBalance, overdueAmount };
  },

  async recordInvoicePayment(
    userId: string,
    payerId: string,
    transactionId: string,
    body: { amount: number; paymentType: "Cash" | "Transfer" | "Card" },
  ) {
    await findOwnedPayer(userId, payerId);
    const txn = await prisma.payerTransaction.findFirst({
      where: { id: transactionId, payerId },
    });
    if (!txn) throw new HttpReplyError(404, "Transaction not found");
    if (txn.paymentType !== "Invoice") {
      throw new HttpReplyError(400, "Payments can only be recorded on invoice transactions");
    }
    if (txn.status === "VOID") {
      throw new HttpReplyError(400, "Cannot record payment on a void transaction");
    }

    const amount = normalizeMoneyAmount(body.amount);
    if (amount <= 0) {
      throw new HttpReplyError(400, "Amount must be greater than zero");
    }

    const paid = coerceInvoiceAmountPaid(txn.invoiceAmountPaid);
    const remaining = amountRemaining(d(txn.amount), paid);
    if (remaining <= 0) {
      throw new HttpReplyError(400, "This invoice is fully paid");
    }
    if (amount > remaining) {
      throw new HttpReplyError(400, "Payment amount exceeds remaining balance");
    }

    const nextPaid = buildInvoiceAmountPaid([
      ...paid.items,
      { amount, paymentType: body.paymentType },
    ]);
    const nextRemaining = amountRemaining(d(txn.amount), nextPaid);
    let nextStatus: PayerTransactionStatus = txn.status as PayerTransactionStatus;
    if (nextRemaining <= 0) {
      nextStatus = "PAID";
    } else if (txn.status === "OVERDUE") {
      nextStatus = "OVERDUE";
    } else {
      nextStatus = "OUTSTANDING";
    }

    const updated = await prisma.payerTransaction.update({
      where: { id: transactionId },
      data: {
        invoiceAmountPaid: nextPaid,
        status: nextStatus,
      },
    });

    await ledgerPostingService.postPayerCollection(
      userId,
      transactionId,
      amount,
      body.paymentType,
      new Date(`${txn.date}T12:00:00.000Z`),
      `pay:${nextPaid.total}`,
    );

    await refreshOverdueStatuses(payerId);
    const transactions = await prisma.payerTransaction.findMany({
      where: { payerId },
    });
    const rollups = computePayerRollups(transactions);
    const payer = await prisma.payer.findUniqueOrThrow({ where: { id: payerId } });

    return {
      ...mapTransactionRow(updated),
      payer: {
        id: payer.id,
        totalAmount: rollups.totalAmount,
        arBalance: rollups.arBalance,
        overdueAmount: rollups.overdueAmount,
        status: rollups.status,
        lastTransactionDate: rollups.lastTransactionDate,
      },
    };
  },

  async createDocument(
    userId: string,
    payerId: string,
    body: {
      title: string;
      kind?: PayerDocumentKind;
      url: string;
      date?: string;
    },
  ) {
    await findOwnedPayer(userId, payerId);
    const kind = body.kind ?? "OTHER";
    if (!(PAYER_DOCUMENT_KINDS as readonly string[]).includes(kind)) {
      throw new HttpReplyError(400, "Invalid document kind");
    }

    const doc = await prisma.payerDocument.create({
      data: {
        payerId,
        title: body.title.trim() || "Uploaded document",
        kind,
        categoryLabel: PAYER_DOCUMENT_CATEGORY_LABELS[kind],
        date: body.date ?? todayYmd(),
        url: body.url,
        linked: true,
        required: false,
      },
    });
    return mapDocument(doc);
  },

  async listDocuments(userId: string, payerId: string, search?: string) {
    await findOwnedPayer(userId, payerId);
    let docs = await prisma.payerDocument.findMany({
      where: {
        payerId,
        OR: [{ linked: true }, { url: { not: null } }],
      },
      orderBy: { createdAt: "desc" },
    });

    if (search?.trim()) {
      const q = search.trim().toLowerCase();
      docs = docs.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.categoryLabel.toLowerCase().includes(q),
      );
    }

    return { documents: docs.map(mapDocument) };
  },
};
