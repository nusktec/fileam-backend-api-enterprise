import { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import {
  BENEFICIARY_DOCUMENT_CATEGORY_LABELS,
  computeBeneficiaryLedger,
  computeWhtAmounts,
  defaultWhtClassForBeneficiary,
  deriveWhtBadgeStatus,
  nextExpenseReference,
  roundMoney,
  type BeneficiaryDocumentKind,
  type BeneficiaryEntryType,
  type BeneficiaryListFilter,
  type BeneficiaryType,
  type WhtClass,
} from "../../constants/beneficiary";
import { formatTodayYmd } from "../../constants/employer";
import { HttpReplyError } from "../../utils/httpReplyError";

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

type BeneficiaryRow = {
  id: string;
  userId: string;
  name: string;
  beneficiaryType: string;
  vendorCategory: string | null;
  partyType: string | null;
  entityType: string;
  residency: string;
  tin: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  bankName: string | null;
  accountName: string | null;
  accountNumber: string | null;
  vatApplicable: boolean;
  whtApplicable: boolean;
  totalWht: Decimal;
  outstanding: Decimal;
  remitted: Decimal;
  lastTransactionDate: string | null;
  whtDueDate: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function mapBeneficiaryBase(row: BeneficiaryRow) {
  const totalWht = roundMoney(d(row.totalWht));
  const outstanding = roundMoney(d(row.outstanding));
  const remitted = roundMoney(d(row.remitted));
  return {
    id: row.id,
    name: row.name,
    beneficiaryType: row.beneficiaryType,
    vendorCategory: row.vendorCategory,
    partyType: row.partyType,
    entityType: row.entityType,
    residency: row.residency,
    tin: row.tin,
    phone: row.phone,
    email: row.email,
    address: row.address,
    bankName: row.bankName,
    accountName: row.accountName,
    accountNumber: row.accountNumber,
    vatApplicable: row.vatApplicable,
    whtApplicable: row.whtApplicable,
    totalWht,
    outstanding,
    remitted,
    lastTransactionDate: row.lastTransactionDate,
    whtDueDate: row.whtDueDate,
    whtStatus: deriveWhtBadgeStatus({
      whtApplicable: row.whtApplicable,
      outstanding,
      remitted,
      totalWht,
      whtDueDate: row.whtDueDate,
      todayYmd: todayYmd(),
    }),
    createdAt: row.createdAt.toISOString().slice(0, 10),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapTransactionRow(row: {
  id: string;
  beneficiaryId: string;
  description: string;
  date: string;
  reference: string;
  entryType: string;
  invoiceNumber: string | null;
  invoiceId: string | null;
  invoiceStatus: string | null;
  whtClass: string;
  statutoryWhtRate: Decimal;
  whtRateOverride: boolean;
  whtOverrideReason: string | null;
  grossAmount: Decimal;
  whtRate: Decimal;
  whtAmount: Decimal;
  netPayable: Decimal;
  status: string;
  createdAt: Date;
}) {
  return {
    id: row.id,
    beneficiaryId: row.beneficiaryId,
    description: row.description,
    date: row.date,
    reference: row.reference,
    entryType: row.entryType,
    invoiceNumber: row.invoiceNumber,
    invoiceId: row.invoiceId,
    invoiceStatus: row.invoiceStatus,
    whtClass: row.whtClass,
    statutoryWhtRate: roundMoney(d(row.statutoryWhtRate)),
    whtRateOverride: row.whtRateOverride,
    whtOverrideReason: row.whtOverrideReason,
    grossAmount: roundMoney(d(row.grossAmount)),
    whtRate: roundMoney(d(row.whtRate)),
    whtAmount: roundMoney(d(row.whtAmount)),
    netPayable: roundMoney(d(row.netPayable)),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapDocumentRow(row: {
  id: string;
  beneficiaryId: string;
  title: string;
  kind: string;
  categoryLabel: string;
  date: string;
  url: string;
  linked: boolean;
  createdAt: Date;
}) {
  return {
    id: row.id,
    beneficiaryId: row.beneficiaryId,
    title: row.title,
    kind: row.kind,
    categoryLabel: row.categoryLabel,
    date: row.date,
    url: row.url,
    linked: row.linked,
    createdAt: row.createdAt.toISOString(),
  };
}

async function findOwnedBeneficiary(userId: string, beneficiaryId: string) {
  const row = await prisma.beneficiary.findFirst({
    where: { id: beneficiaryId, userId },
  });
  if (!row) {
    throw new HttpReplyError(404, "Beneficiary not found");
  }
  return row;
}

async function recomputeAndPersistBalances(beneficiaryId: string) {
  const transactions = await prisma.beneficiaryTransaction.findMany({
    where: { beneficiaryId },
  });
  const rollup = computeBeneficiaryLedger(
    transactions.map((t) => ({
      entryType: t.entryType,
      date: t.date,
      grossAmount: d(t.grossAmount),
      whtAmount: d(t.whtAmount),
      status: t.status,
      invoiceStatus: t.invoiceStatus,
      invoiceId: t.invoiceId,
    })),
  );
  await prisma.beneficiary.update({
    where: { id: beneficiaryId },
    data: {
      totalWht: new Decimal(rollup.totalWht),
      outstanding: new Decimal(rollup.outstanding),
      remitted: new Decimal(rollup.remitted),
      lastTransactionDate: rollup.lastTransactionDate,
      whtDueDate: rollup.whtDueDate,
    },
  });
  return rollup;
}

function validateCreateOrUpdateBody(body: Record<string, unknown>) {
  const beneficiaryType = String(body.beneficiaryType ?? "");
  if (!beneficiaryType) {
    throw new HttpReplyError(400, "Select a beneficiary type");
  }
  const name = String(body.name ?? "").trim();
  if (!name) {
    throw new HttpReplyError(400, "Name is required");
  }
  if (!body.entityType) {
    throw new HttpReplyError(400, "Select an entity type");
  }
  if (!body.residency) {
    throw new HttpReplyError(400, "Select residency");
  }
  if (beneficiaryType === "VENDOR" && !body.vendorCategory) {
    throw new HttpReplyError(400, "Select a vendor category");
  }
  if (beneficiaryType === "RECEIVING_PARTY" && !body.partyType) {
    throw new HttpReplyError(400, "Select a party type");
  }
}

function profileDataFromBody(body: Record<string, unknown>) {
  const beneficiaryType = String(body.beneficiaryType) as BeneficiaryType;
  return {
    name: String(body.name).trim(),
    beneficiaryType,
    vendorCategory:
      beneficiaryType === "VENDOR"
        ? (String(body.vendorCategory) as string)
        : null,
    partyType:
      beneficiaryType === "RECEIVING_PARTY"
        ? (String(body.partyType) as string)
        : null,
    entityType: String(body.entityType),
    residency: String(body.residency),
    whtApplicable: Boolean(body.whtApplicable),
    tin: body.tin ? String(body.tin).trim() : null,
    phone: body.phone ? String(body.phone).trim() : null,
    email: body.email ? String(body.email).trim() : null,
    address: body.address ? String(body.address).trim() : null,
    bankName: body.bankName ? String(body.bankName).trim() : null,
    accountNumber: body.accountNumber
      ? String(body.accountNumber).trim()
      : null,
    vatApplicable: false,
    accountName: null,
  };
}

function matchesSearch(row: BeneficiaryRow, search: string): boolean {
  const q = search.toLowerCase();
  return [row.name, row.tin, row.phone, row.email].some(
    (v) => v && v.toLowerCase().includes(q),
  );
}

export const beneficiariesService = {
  async list(
    userId: string,
    query: {
      type?: BeneficiaryListFilter;
      search?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = query.page ?? 1;
    const limit = Math.min(Math.max(1, query.limit ?? 50), 100);
    const filterType = query.type ?? "ALL";
    const search = query.search?.trim().toLowerCase();

    const rows = await prisma.beneficiary.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    });

    let filteredRows = [...rows];
    if (filterType === "VENDOR") {
      filteredRows = filteredRows.filter((r) => r.beneficiaryType === "VENDOR");
    } else if (filterType === "RECEIVING_PARTY") {
      filteredRows = filteredRows.filter(
        (r) => r.beneficiaryType === "RECEIVING_PARTY",
      );
    }

    const allMapped = rows.map((r) => mapBeneficiaryBase(r));
    let items = filteredRows.map((r) => mapBeneficiaryBase(r));

    if (filterType === "WHT_DUE") {
      items = items.filter(
        (b) => b.whtStatus === "PENDING" || b.whtStatus === "OVERDUE",
      );
    }

    if (search) {
      items = items.filter((b) => {
        const row = filteredRows.find((r) => r.id === b.id);
        return row ? matchesSearch(row, search) : false;
      });
    }
    const summary = {
      total: allMapped.length,
      vendorCount: allMapped.filter((b) => b.beneficiaryType === "VENDOR")
        .length,
      receivingPartyCount: allMapped.filter(
        (b) => b.beneficiaryType === "RECEIVING_PARTY",
      ).length,
      totalWht: roundMoney(allMapped.reduce((s, b) => s + b.totalWht, 0)),
      outstanding: roundMoney(allMapped.reduce((s, b) => s + b.outstanding, 0)),
      remitted: roundMoney(allMapped.reduce((s, b) => s + b.remitted, 0)),
    };

    const total = items.length;
    const paged = items.slice((page - 1) * limit, page * limit);

    return {
      summary,
      beneficiaries: paged,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  },

  async create(userId: string, body: Record<string, unknown>) {
    validateCreateOrUpdateBody(body);
    const profile = profileDataFromBody(body);
    const row = await prisma.beneficiary.create({
      data: { userId, ...profile },
    });
    return mapBeneficiaryBase(row);
  },

  async getById(userId: string, beneficiaryId: string) {
    const row = await findOwnedBeneficiary(userId, beneficiaryId);
    const [transactions, documents] = await Promise.all([
      prisma.beneficiaryTransaction.findMany({
        where: { beneficiaryId },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      }),
      prisma.beneficiaryDocument.findMany({
        where: { beneficiaryId },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      }),
    ]);

    const ledger = computeBeneficiaryLedger(
      transactions.map((t) => ({
        entryType: t.entryType,
        date: t.date,
        grossAmount: d(t.grossAmount),
        whtAmount: d(t.whtAmount),
        status: t.status,
        invoiceStatus: t.invoiceStatus,
        invoiceId: t.invoiceId,
      })),
    );

    const defaultWhtClass = defaultWhtClassForBeneficiary({
      whtApplicable: row.whtApplicable,
      beneficiaryType: row.beneficiaryType as BeneficiaryType,
      vendorCategory: row.vendorCategory,
      partyType: row.partyType,
    });

    return {
      ...mapBeneficiaryBase(row),
      defaultWhtClass,
      totalExpense: ledger.totalExpense,
      unpaidInvoices: ledger.unpaidInvoices,
      whtPayable: ledger.totalWht,
      transactions: transactions.map(mapTransactionRow),
      documents: documents.map(mapDocumentRow),
    };
  },

  async update(
    userId: string,
    beneficiaryId: string,
    body: Record<string, unknown>,
  ) {
    validateCreateOrUpdateBody(body);
    await findOwnedBeneficiary(userId, beneficiaryId);
    const profile = profileDataFromBody(body);
    await prisma.beneficiary.update({
      where: { id: beneficiaryId },
      data: profile,
    });
    return this.getById(userId, beneficiaryId);
  },

  async createTransaction(
    userId: string,
    beneficiaryId: string,
    body: Record<string, unknown>,
  ) {
    const beneficiary = await findOwnedBeneficiary(userId, beneficiaryId);
    const entryType = String(body.entryType ?? "") as BeneficiaryEntryType;
    if (entryType !== "INVOICE" && entryType !== "PAYMENT") {
      throw new HttpReplyError(400, "Select invoice or payment");
    }
    let description = String(body.description ?? "").trim();
    const grossAmount = roundMoney(Number(body.grossAmount));
    if (!(grossAmount > 0)) {
      throw new HttpReplyError(400, "Gross amount must be greater than 0");
    }
    const date = String(body.date);

    const whtClass = (body.whtClass
      ? String(body.whtClass)
      : defaultWhtClassForBeneficiary({
          whtApplicable: beneficiary.whtApplicable,
          beneficiaryType: beneficiary.beneficiaryType as BeneficiaryType,
          vendorCategory: beneficiary.vendorCategory,
          partyType: beneficiary.partyType,
        })) as WhtClass;

    let reference = body.reference
      ? String(body.reference).trim().toUpperCase()
      : "";
    if (!reference) {
      const existing = await prisma.beneficiaryTransaction.findMany({
        where: { beneficiaryId },
        select: { reference: true },
      });
      reference = nextExpenseReference(existing.map((r) => r.reference));
    }

    if (entryType === "INVOICE") {
      if (!description) {
        throw new HttpReplyError(400, "Description is required");
      }
      if (body.invoiceId || body.whtRateOverride || body.whtRate != null) {
        throw new HttpReplyError(400, "Invalid invoice fields");
      }
      const invoiceNumber = String(body.invoiceNumber ?? "").trim();
      if (!invoiceNumber) {
        throw new HttpReplyError(400, "Invoice number is required");
      }
      const amounts = computeWhtAmounts({
        grossAmount,
        whtClass,
        entityType: beneficiary.entityType as "CORPORATE" | "INDIVIDUAL",
        residency: beneficiary.residency as "RESIDENT" | "NON_RESIDENT",
      });

      try {
        const txn = await prisma.beneficiaryTransaction.create({
          data: {
            beneficiaryId,
            description,
            date,
            reference,
            entryType: "INVOICE",
            invoiceNumber,
            invoiceId: null,
            invoiceStatus: "UNPAID",
            whtClass,
            statutoryWhtRate: new Decimal(amounts.statutoryWhtRate),
            whtRateOverride: false,
            whtOverrideReason: null,
            grossAmount: new Decimal(grossAmount),
            whtRate: new Decimal(amounts.whtRate),
            whtAmount: new Decimal(amounts.whtAmount),
            netPayable: new Decimal(amounts.netPayable),
            status: "PENDING",
          },
        });
        await recomputeAndPersistBalances(beneficiaryId);
        const updated = await prisma.beneficiary.findUniqueOrThrow({
          where: { id: beneficiaryId },
        });
        return {
          transaction: mapTransactionRow(txn),
          beneficiary: {
            id: updated.id,
            totalWht: roundMoney(d(updated.totalWht)),
            outstanding: roundMoney(d(updated.outstanding)),
            remitted: roundMoney(d(updated.remitted)),
            lastTransactionDate: updated.lastTransactionDate,
            whtDueDate: updated.whtDueDate,
            whtStatus: deriveWhtBadgeStatus({
              whtApplicable: updated.whtApplicable,
              outstanding: d(updated.outstanding),
              remitted: d(updated.remitted),
              totalWht: d(updated.totalWht),
              whtDueDate: updated.whtDueDate,
              todayYmd: todayYmd(),
            }),
          },
        };
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === "P2002"
        ) {
          throw new HttpReplyError(409, "Reference already exists");
        }
        throw e;
      }
    }

    // PAYMENT
    const whtRateOverride = Boolean(body.whtRateOverride);
    if (whtRateOverride) {
      const rate = Number(body.whtRate);
      if (Number.isNaN(rate) || rate < 0 || rate > 100) {
        throw new HttpReplyError(400, "Enter a rate between 0 and 100");
      }
      const reason = String(body.whtOverrideReason ?? "").trim();
      if (!reason) {
        throw new HttpReplyError(400, "Give a reason for the rate override");
      }
    }

    let invoiceNumber: string | null = body.invoiceNumber
      ? String(body.invoiceNumber).trim()
      : null;
    let invoiceId: string | null = body.invoiceId
      ? String(body.invoiceId)
      : null;
    let paymentWhtClass = (body.whtClass
      ? String(body.whtClass)
      : whtClass) as WhtClass;

    if (invoiceId) {
      const invoice = await prisma.beneficiaryTransaction.findFirst({
        where: {
          id: invoiceId,
          beneficiaryId,
          entryType: "INVOICE",
          invoiceStatus: "UNPAID",
        },
      });
      if (!invoice) {
        throw new HttpReplyError(400, "Invoice not found or already paid");
      }
      if (roundMoney(d(invoice.grossAmount)) !== grossAmount) {
        throw new HttpReplyError(
          400,
          "Payment must match the unpaid invoice amount",
        );
      }
      if (!description) description = invoice.description;
      invoiceNumber = invoiceNumber ?? invoice.invoiceNumber;
      if (!body.whtClass) paymentWhtClass = invoice.whtClass as WhtClass;
    }

    if (!description) {
      throw new HttpReplyError(400, "Description is required");
    }

    const amounts = computeWhtAmounts({
      grossAmount,
      whtClass: paymentWhtClass,
      entityType: beneficiary.entityType as "CORPORATE" | "INDIVIDUAL",
      residency: beneficiary.residency as "RESIDENT" | "NON_RESIDENT",
      whtRateOverride,
      whtRate: whtRateOverride ? Number(body.whtRate) : undefined,
    });

    try {
      const result = await prisma.$transaction(async (tx) => {
        if (invoiceId) {
          await tx.beneficiaryTransaction.update({
            where: { id: invoiceId },
            data: { invoiceStatus: "PAID" },
          });
        }
        const txn = await tx.beneficiaryTransaction.create({
          data: {
            beneficiaryId,
            description,
            date,
            reference,
            entryType: "PAYMENT",
            invoiceNumber,
            invoiceId,
            invoiceStatus: null,
            whtClass: paymentWhtClass,
            statutoryWhtRate: new Decimal(amounts.statutoryWhtRate),
            whtRateOverride,
            whtOverrideReason: whtRateOverride
              ? String(body.whtOverrideReason).trim()
              : null,
            grossAmount: new Decimal(grossAmount),
            whtRate: new Decimal(amounts.whtRate),
            whtAmount: new Decimal(amounts.whtAmount),
            netPayable: new Decimal(amounts.netPayable),
            status: "PENDING",
          },
        });
        return txn;
      });

      await recomputeAndPersistBalances(beneficiaryId);
      const updated = await prisma.beneficiary.findUniqueOrThrow({
        where: { id: beneficiaryId },
      });
      return {
        transaction: mapTransactionRow(result),
        beneficiary: {
          id: updated.id,
          totalWht: roundMoney(d(updated.totalWht)),
          outstanding: roundMoney(d(updated.outstanding)),
          remitted: roundMoney(d(updated.remitted)),
          lastTransactionDate: updated.lastTransactionDate,
          whtDueDate: updated.whtDueDate,
          whtStatus: deriveWhtBadgeStatus({
            whtApplicable: updated.whtApplicable,
            outstanding: d(updated.outstanding),
            remitted: d(updated.remitted),
            totalWht: d(updated.totalWht),
            whtDueDate: updated.whtDueDate,
            todayYmd: todayYmd(),
          }),
        },
      };
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        throw new HttpReplyError(409, "Reference already exists");
      }
      throw e;
    }
  },

  async remitWht(
    userId: string,
    beneficiaryId: string,
    transactionId: string,
    body?: { remittedAt?: string; receiptUrl?: string },
  ) {
    await findOwnedBeneficiary(userId, beneficiaryId);
    const txn = await prisma.beneficiaryTransaction.findFirst({
      where: { id: transactionId, beneficiaryId },
    });
    if (!txn) {
      throw new HttpReplyError(404, "Transaction not found");
    }
    if (txn.entryType !== "PAYMENT") {
      throw new HttpReplyError(400, "Select an expense with WHT");
    }
    if (d(txn.whtAmount) <= 0) {
      throw new HttpReplyError(400, "Select an expense with WHT");
    }
    if (txn.status === "REMITTED") {
      throw new HttpReplyError(400, "This expense has no outstanding WHT.");
    }
    if (txn.status !== "PENDING") {
      throw new HttpReplyError(400, "This expense has no outstanding WHT.");
    }

    const moved = roundMoney(d(txn.whtAmount));
    await prisma.beneficiaryTransaction.update({
      where: { id: transactionId },
      data: { status: "REMITTED" },
    });

    if (body?.receiptUrl?.trim()) {
      const docDate = body.remittedAt ?? todayYmd();
      await prisma.beneficiaryDocument.create({
        data: {
          beneficiaryId,
          title: "WHT remittance receipt",
          kind: "WHT",
          categoryLabel: BENEFICIARY_DOCUMENT_CATEGORY_LABELS.WHT,
          date: docDate,
          url: body.receiptUrl.trim(),
          linked: true,
        },
      });
    }

    await recomputeAndPersistBalances(beneficiaryId);
    const updated = await prisma.beneficiary.findUniqueOrThrow({
      where: { id: beneficiaryId },
    });

    return {
      transaction: {
        id: txn.id,
        status: "REMITTED",
        whtAmount: moved,
      },
      moved,
      beneficiary: {
        id: updated.id,
        totalWht: roundMoney(d(updated.totalWht)),
        outstanding: roundMoney(d(updated.outstanding)),
        remitted: roundMoney(d(updated.remitted)),
        whtDueDate: updated.whtDueDate,
        whtStatus: deriveWhtBadgeStatus({
          whtApplicable: updated.whtApplicable,
          outstanding: d(updated.outstanding),
          remitted: d(updated.remitted),
          totalWht: d(updated.totalWht),
          whtDueDate: updated.whtDueDate,
          todayYmd: todayYmd(),
        }),
      },
    };
  },

  async createDocument(
    userId: string,
    beneficiaryId: string,
    body: {
      title: string;
      kind: BeneficiaryDocumentKind;
      url: string;
      date?: string;
    },
  ) {
    await findOwnedBeneficiary(userId, beneficiaryId);
    const url = body.url?.trim();
    if (!url) {
      throw new HttpReplyError(400, "Document URL is required");
    }
    const kind = body.kind;
    const doc = await prisma.beneficiaryDocument.create({
      data: {
        beneficiaryId,
        title: body.title?.trim() || "Document",
        kind,
        categoryLabel: BENEFICIARY_DOCUMENT_CATEGORY_LABELS[kind],
        date: body.date ?? todayYmd(),
        url,
        linked: true,
      },
    });
    return mapDocumentRow(doc);
  },
};
