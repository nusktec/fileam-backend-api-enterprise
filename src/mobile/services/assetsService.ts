import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import {
  ASSET_ON_BOOKS_STATUSES,
  ASSET_STATUS,
  ASSET_TYPES,
  CONSULTANT_REVIEW_STATUS,
  CONSULTANT_REVIEW_OPEN_STATUSES,
  GAIN_LOSS_TYPES,
  TRANSFER_STATUSES,
  isAssetInReviewStatus,
  isAssetOnBooks,
  normalizeDepreciationMethod,
  type AssetStatus,
  type DepreciationMethod,
  type GainLossType,
} from "../../constants/assets";
import {
  computeAssetDepreciation,
  computeStraightLineDepreciation,
} from "../../constants/assetDepreciation";
import { PERCENT } from "../../constants/percentages";
import { HttpReplyError } from "../../utils/httpReplyError";
import { ledgerPostingService } from "../../services/ledgerPostingService";
import {
  assertMonetaryAmountInRange,
  normalizeMoneyAmount,
} from "../../utils/monetaryAmount";
import {
  isPendingAsyncPaymentType,
  isSalePaidStatus,
  resolveSaleInvoiceStatus,
  SALE_RECEIVABLE_STATUSES,
  SALE_STATUS,
} from "../../constants/salePaymentRules";
import { coerceInvoiceAmountPaid } from "../../constants/invoiceAmountPaid";
import { appendAssetHistory } from "./assetHistoryHelper";
import { prepaymentsService } from "./prepaymentsService";
import {
  BANK_ACCOUNT_TYPE_LABELS,
  CASH_TYPE_LABELS,
} from "../../constants/cashBank";
import { RECEIVABLE_TYPES } from "../../constants/receivables";
import { cashBankService } from "./cashBankService";
import { LEDGER_ACCOUNTS } from "../../constants/ledger";
import { ledgerService } from "../../services/ledgerService";

export { computeAssetDepreciation, computeStraightLineDepreciation };

const ASSET_COUNTER_ID = "asset_number";
const TRANSFER_COUNTER_ID = "asset_transfer_number";
const SALE_COUNTER_ID = "asset_sale_number";
const DISPOSAL_COUNTER_ID = "asset_disposal_number";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function startOfUtcDayMs(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function isBankLedgerCode(code: string): boolean {
  return (
    code === LEDGER_ACCOUNTS.BANK ||
    code.startsWith(`${LEDGER_ACCOUNTS.BANK}:`) ||
    code === LEDGER_ACCOUNTS.CARD_SETTLEMENT
  );
}

function isCashLedgerCode(code: string): boolean {
  return (
    code === LEDGER_ACCOUNTS.CASH_ON_HAND ||
    code === LEDGER_ACCOUNTS.PETTY_CASH ||
    code === LEDGER_ACCOUNTS.OTHER_CASH
  );
}

/**
 * Book-based current assets from the double-entry ledger:
 * - Cash / Bank balances = posted ledger account balances
 * - AR: unpaid sales (Pending / Partial / Overdue / IN_PROGRESS) at outstanding amount
 * - Inventory: qty × purchaseCost
 */
async function buildCurrentAssetsSnapshot(userId: string) {
  const [inventoryItems, unpaidSales, business, userCash, userBanks, receivableRows, ledgerBalances] =
    await Promise.all([
      prisma.inventoryItem.findMany({ where: { userId } }),
      prisma.sale.findMany({
        where: {
          userId,
          status: { in: [...SALE_RECEIVABLE_STATUSES] },
        },
        orderBy: [{ saleDate: "desc" }, { createdAt: "desc" }],
      }),
      prisma.business.findFirst({
        where: { userId },
        select: { bankAccount: true, name: true },
      }),
      cashBankService.listUserCash(userId),
      cashBankService.listUserBanks(userId),
      prisma.receivable.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
      }),
      ledgerService.getPostedBalances(userId),
    ]);

  const balanceByCode = new Map(
    ledgerBalances.map((row) => [row.accountCode, row.balance]),
  );

  const inventoryRows = inventoryItems
    .map((it) => {
      const amount = normalizeMoneyAmount(d(it.quantity) * d(it.purchaseCost));
      return {
        stockName: it.name,
        amount,
        quantity: d(it.quantity),
      };
    })
    .filter((r) => r.amount > 0 || r.quantity > 0);

  const inventoryTotal = normalizeMoneyAmount(
    inventoryRows.reduce((s, r) => s + r.amount, 0),
  );

  const asOfDay = startOfUtcDayMs(new Date());
  const arItems = unpaidSales
    .map((s) => {
      const total = d(s.totalAmount);
      const paid = coerceInvoiceAmountPaid(s.invoiceAmountPaid).total;
      const amount = normalizeMoneyAmount(Math.max(0, total - paid));
      if (amount <= 0) return null;

      const resolved = resolveSaleInvoiceStatus(s);
      if (isSalePaidStatus(resolved) || resolved === SALE_STATUS.CANCELLED) {
        return null;
      }

      let daysOverdue: number | undefined;
      const due = s.invoiceDueDate;
      if (due) {
        const dueDay = startOfUtcDayMs(due);
        if (dueDay < asOfDay) {
          daysOverdue = Math.max(
            0,
            Math.floor((asOfDay - dueDay) / MS_PER_DAY),
          );
        }
      }

      const isOverdue =
        resolved === SALE_STATUS.OVERDUE || daysOverdue != null;

      const item: {
        invoiceNumber: string;
        customerName: string | null;
        status: "CURRENT" | "OVERDUE";
        amount: number;
        daysOverdue?: number;
      } = {
        invoiceNumber: s.invoiceNumber,
        customerName: s.customerName,
        status: isOverdue ? "OVERDUE" : "CURRENT",
        amount,
      };
      if (isOverdue && daysOverdue != null) {
        item.daysOverdue = daysOverdue;
      }
      return item;
    })
    .filter(
      (
        r,
      ): r is {
        invoiceNumber: string;
        customerName: string | null;
        status: "CURRENT" | "OVERDUE";
        amount: number;
        daysOverdue?: number;
      } => r != null,
    );

  const currentAr = arItems.filter((r) => r.status === "CURRENT");
  const overdueAr = arItems.filter((r) => r.status === "OVERDUE");
  const arTotal = normalizeMoneyAmount(
    arItems.reduce((s, r) => s + r.amount, 0),
  );
  const arCurrentTotal = normalizeMoneyAmount(
    currentAr.reduce((s, r) => s + r.amount, 0),
  );
  const arOverdueTotal = normalizeMoneyAmount(
    overdueAr.reduce((s, r) => s + r.amount, 0),
  );

  const systemDerivedArItems = arItems.map((item) => ({
    ...item,
    source: "system" as const,
  }));
  const systemDerivedArTotal = arTotal;

  const userAddedArItems = receivableRows.map((r) => {
    const outstanding = normalizeMoneyAmount(d(r.outstandingAmount));
    const amount = normalizeMoneyAmount(d(r.grossAmount));
    const amountReceived = normalizeMoneyAmount(d(r.amountReceived));
    const dueDate = r.dueDate ? dateToIsoDate(r.dueDate) : null;
    const item: Record<string, unknown> = {
      id: r.receivableCode,
      type: r.type,
      amount,
      amountReceived,
      outstandingAmount: outstanding,
      dueDate,
      status: r.status,
      source: "user" as const,
    };
    if (r.partyName) item.partyName = r.partyName;
    if (r.supplierId) item.supplierId = r.supplierId;
    if (r.supplierName) item.supplierName = r.supplierName;
    return item;
  });

  const sumOutstandingByType = (type: string) =>
    normalizeMoneyAmount(
      receivableRows
        .filter((r) => r.type === type)
        .reduce((s, r) => s + d(r.outstandingAmount), 0),
    );

  const fixedAssetSaleReceivables = sumOutstandingByType(
    RECEIVABLE_TYPES.FIXED_ASSET_SALE_ON_CREDIT,
  );
  const supplierRefundReceivables = sumOutstandingByType(
    RECEIVABLE_TYPES.SUPPLIER_REFUND_OVERPAYMENT,
  );
  const employeeAdvanceReceivables = sumOutstandingByType(
    RECEIVABLE_TYPES.EMPLOYEE_DIRECTOR_ADVANCE,
  );
  const taxReceivables = sumOutstandingByType(
    RECEIVABLE_TYPES.TAX_REFUND_VAT_CREDIT,
  );
  const investmentIncomeReceivables = sumOutstandingByType(
    RECEIVABLE_TYPES.INVESTMENT_INCOME_OWED,
  );

  const userAddedArTotal = normalizeMoneyAmount(
    userAddedArItems.reduce(
      (s, r) => s + (r.outstandingAmount as number),
      0,
    ),
  );
  const accountsReceivableTotal = normalizeMoneyAmount(
    systemDerivedArTotal + userAddedArTotal,
  );

  const ledgerCashTotal = normalizeMoneyAmount(
    ledgerBalances
      .filter((row) => isCashLedgerCode(row.accountCode))
      .reduce((sum, row) => sum + row.balance, 0),
  );
  const ledgerBankTotal = normalizeMoneyAmount(
    ledgerBalances
      .filter((row) => isBankLedgerCode(row.accountCode))
      .reduce((sum, row) => sum + row.balance, 0),
  );

  const prepayments = await prepaymentsService.activeBalances(userId);

  const userCashItems = userCash.map((c) => ({
    id: c.cashCode,
    cashType: c.cashType,
    title: CASH_TYPE_LABELS[c.cashType as keyof typeof CASH_TYPE_LABELS] ?? c.cashType,
    subtitle: c.note ?? "User-added cash balance",
    amount: normalizeMoneyAmount(Number(c.amount)),
    source: "user" as const,
  }));

  const userBankItems = userBanks.map((b) => ({
    id: b.bankCode,
    bankName: b.bankName,
    accountType:
      BANK_ACCOUNT_TYPE_LABELS[
        b.accountType as keyof typeof BANK_ACCOUNT_TYPE_LABELS
      ] ?? b.accountType,
    accountNumber: b.accountNumber,
    amount: normalizeMoneyAmount(
      balanceByCode.get(`${LEDGER_ACCOUNTS.BANK}:${b.bankCode}`) ??
        Number(b.openingBalance),
    ),
    source: "user" as const,
  }));

  const userCashFromRegisters = normalizeMoneyAmount(
    userCashItems.reduce((s, r) => s + r.amount, 0),
  );
  const userBankFromRegisters = normalizeMoneyAmount(
    userBankItems.reduce((s, r) => s + r.amount, 0),
  );

  const systemCashBalance = normalizeMoneyAmount(
    Math.max(0, ledgerCashTotal - userCashFromRegisters),
  );

  const systemCashItems =
    systemCashBalance > 0
      ? [
          {
            id: "system-cash",
            title: "Cash on hand",
            subtitle: "Ledger cash balance from sales, expenses, and openings",
            amount: systemCashBalance,
            source: "system" as const,
          },
        ]
      : ([] as Array<{
          id: string;
          title: string;
          subtitle: string;
          amount: number;
          source: "system";
        }>);

  const accountNumber = business?.bankAccount?.trim() || "Not set";
  const aggregateBankBalance = normalizeMoneyAmount(
    balanceByCode.get(LEDGER_ACCOUNTS.BANK) ?? 0,
  );
  const cardSettlementBalance = normalizeMoneyAmount(
    balanceByCode.get(LEDGER_ACCOUNTS.CARD_SETTLEMENT) ?? 0,
  );

  type SystemBankItem = {
    id: string;
    bankName: string;
    accountType: string;
    accountNumber: string;
    amount: number;
    source: "system";
  };

  const systemBankItems: SystemBankItem[] = [];

  if (aggregateBankBalance > 0) {
    systemBankItems.push({
      id: "system-bank",
      bankName: business?.name?.trim()
        ? `${business.name.trim()} — primary`
        : "Primary bank account",
      accountType: "Current",
      accountNumber,
      amount: aggregateBankBalance,
      source: "system",
    });
  }

  if (cardSettlementBalance > 0) {
    systemBankItems.push({
      id: "card-settlement",
      bankName: "Card settlement",
      accountType: "Current",
      accountNumber: "Card processor balance",
      amount: cardSettlementBalance,
      source: "system",
    });
  }

  const systemBankBalance = normalizeMoneyAmount(
    systemBankItems.reduce((s, row) => s + row.amount, 0),
  );

  const cash = {
    total: normalizeMoneyAmount(ledgerCashTotal),
    systemDerived: {
      total: systemCashBalance,
      items: systemCashItems,
    },
    userAdded: {
      total: userCashFromRegisters,
      items: userCashItems,
    },
    items: [...systemCashItems, ...userCashItems],
  };

  const bankBalances = {
    total: normalizeMoneyAmount(ledgerBankTotal),
    systemDerived: {
      total: systemBankBalance,
      items: systemBankItems,
    },
    userAdded: {
      total: userBankFromRegisters,
      items: userBankItems,
    },
    items: [...systemBankItems, ...userBankItems],
  };

  const totalCurrentAssets = normalizeMoneyAmount(
    cash.total +
      bankBalances.total +
      inventoryTotal +
      accountsReceivableTotal +
      prepayments.total,
  );

  return {
    totalCurrentAssets,
    cash,
    bankBalances,
    inventory: {
      total: inventoryTotal,
      numberOfSku: inventoryRows.length,
      items: inventoryRows.map(({ stockName, amount }) => ({
        stockName,
        amount,
      })),
    },
    accountsReceivable: {
      total: accountsReceivableTotal,
      fixedAssetSaleReceivables,
      supplierRefundReceivables,
      employeeAdvanceReceivables,
      taxReceivables,
      investmentIncomeReceivables,
      systemDerived: {
        total: systemDerivedArTotal,
        items: systemDerivedArItems,
      },
      userAdded: {
        total: userAddedArTotal,
        items: userAddedArItems,
      },
      current: {
        totalAmount: arCurrentTotal,
        invoiceCount: currentAr.length,
      },
      overdue: {
        totalAmount: arOverdueTotal,
        invoiceCount: overdueAr.length,
      },
      items: [...systemDerivedArItems, ...userAddedArItems],
    },
    prepayments,
    /** Diagnostic totals from ledger (not required by UI spec). */
    methodology: {
      ledgerCashTotal,
      ledgerBankTotal,
      note: "Cash and bank totals are derived from posted double-entry ledger balances (BANK:{bankCode}, CARD_SETTLEMENT, CASH_ON_HAND, PETTY_CASH, OTHER_CASH). Transfer posts to the selected business bank account; Card posts to a mapped bank account or CARD_SETTLEMENT — both only after payment-status confirmation (PAID).",
    },
  };
}

function d(v: Decimal | null | undefined): number {
  if (v == null) return 0;
  return Number(v);
}

function dec(n: number): Decimal {
  return new Decimal(normalizeMoneyAmount(n));
}

function parseDateOnly(value: string): Date {
  return new Date(`${value.trim()}T12:00:00.000Z`);
}

function dateToIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

async function nextCodedNumber(
  counterId: string,
  prefix: string,
): Promise<string> {
  const counter = await prisma.counter.upsert({
    where: { id: counterId },
    create: { id: counterId, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });
  return `${prefix}-${String(counter.lastNumber).padStart(4, "0")}`;
}

type DepreciationAssetFields = {
  purchaseCost: Decimal | number;
  purchaseDate: Date;
  depreciationMethod?: string | null;
  usefulLife?: number | null;
  residualValue?: Decimal | number | null;
  depreciationRate?: Decimal | number | null;
  totalEstimatedUnit?: Decimal | number | null;
  unitProduced?: Decimal | number | null;
};

function depFromAsset(asset: DepreciationAssetFields, asOf?: Date) {
  return computeAssetDepreciation({
    purchaseCost: d(asset.purchaseCost as Decimal),
    purchaseDate: asset.purchaseDate,
    depreciationMethod: asset.depreciationMethod,
    usefulLife: asset.usefulLife,
    residualValue: d(asset.residualValue as Decimal | null | undefined),
    depreciationRate:
      asset.depreciationRate != null ? d(asset.depreciationRate as Decimal) : null,
    totalEstimatedUnit:
      asset.totalEstimatedUnit != null
        ? d(asset.totalEstimatedUnit as Decimal)
        : null,
    unitProduced:
      asset.unitProduced != null ? d(asset.unitProduced as Decimal) : null,
    asOf,
  });
}

function assertAssetDepreciationInput(input: {
  purchaseCost: number;
  depreciationMethod?: string | null;
  usefulLife?: number | null;
  residualValue?: number | null;
  depreciationRate?: number | null;
  totalEstimatedUnit?: number | null;
  unitProduced?: number | null;
}): DepreciationMethod {
  const method = normalizeDepreciationMethod(input.depreciationMethod);
  if (!method) {
    throw new HttpReplyError(
      400,
      "depreciationMethod must be STRAIGHT_LINE, REDUCING_BALANCE, or UNIT_OF_PRODUCTION",
    );
  }
  if (input.residualValue == null) {
    throw new HttpReplyError(400, "residualValue is required");
  }
  if (input.residualValue < 0) {
    throw new HttpReplyError(400, "residualValue must be non-negative");
  }
  if (input.residualValue >= input.purchaseCost) {
    throw new HttpReplyError(400, "residualValue must be less than purchaseCost");
  }
  if (method === "STRAIGHT_LINE" || method === "REDUCING_BALANCE") {
    if (input.usefulLife == null || input.usefulLife <= 0) {
      throw new HttpReplyError(400, "usefulLife must be a positive integer (years)");
    }
  }
  if (method === "REDUCING_BALANCE") {
    if (input.depreciationRate == null || input.depreciationRate <= 0) {
      throw new HttpReplyError(400, "depreciationRate must be greater than 0");
    }
    if (input.depreciationRate > 100) {
      throw new HttpReplyError(400, "depreciationRate must be at most 100");
    }
  }
  if (method === "UNIT_OF_PRODUCTION") {
    if (input.totalEstimatedUnit == null || input.totalEstimatedUnit <= 0) {
      throw new HttpReplyError(400, "totalEstimatedUnit must be greater than 0");
    }
    const produced = input.unitProduced ?? 0;
    if (produced < 0) {
      throw new HttpReplyError(400, "unitProduced must be non-negative");
    }
    if (produced > input.totalEstimatedUnit) {
      throw new HttpReplyError(
        400,
        "unitProduced cannot exceed totalEstimatedUnit",
      );
    }
  }
  return method;
}

function deriveGainLoss(
  salePrice: number,
  bookValue: number,
): { gainLossType: GainLossType; gainLossAmount: number } {
  const diff = normalizeMoneyAmount(salePrice - bookValue);
  if (diff > 0) {
    return { gainLossType: GAIN_LOSS_TYPES[0], gainLossAmount: diff };
  }
  if (diff < 0) {
    return {
      gainLossType: GAIN_LOSS_TYPES[1],
      gainLossAmount: normalizeMoneyAmount(Math.abs(diff)),
    };
  }
  return { gainLossType: GAIN_LOSS_TYPES[2], gainLossAmount: 0 };
}

async function findOwnedAsset(userId: string, assetRef: string) {
  const ref = assetRef.trim();
  if (!ref) return null;
  if (UUID_RE.test(ref)) {
    return prisma.asset.findFirst({ where: { id: ref, userId } });
  }
  return prisma.asset.findFirst({
    where: { userId, assetCode: ref },
  });
}

async function findOwnedTransfer(
  client: typeof prisma | Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  userId: string,
  transferRef: string,
) {
  const ref = transferRef.trim();
  if (!ref) return null;
  const include = {
    asset: {
      select: {
        id: true,
        assetCode: true,
        assetName: true,
        assetType: true,
        status: true,
      },
    },
  } as const;
  if (UUID_RE.test(ref)) {
    return client.assetTransfer.findFirst({
      where: { id: ref, userId },
      include,
    });
  }
  return client.assetTransfer.findFirst({
    where: { userId, transferCode: ref },
    include,
  });
}

function mapAssetRow(
  asset: {
    id: string;
    assetCode: string;
    assetName: string;
    assetType: string;
    purchaseCost: Decimal;
    purchaseDate: Date;
    vendor: string | null;
    evidenceUrl: string | null;
    evidenceUrls?: string[];
    depreciationMethod: string | null;
    usefulLife: number | null;
    depreciationRate?: Decimal | null;
    residualValue: Decimal | null;
    totalEstimatedUnit?: Decimal | null;
    unitProduced?: Decimal | null;
    serialNumber: string | null;
    assetLocation: string | null;
    additionalNote: string | null;
    assignToConsultant: boolean;
    assignedConsultantId?: string | null;
    consultantReviewStatus: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  },
  asOf = new Date(),
) {
  const cost = d(asset.purchaseCost);
  const dep = depFromAsset(asset, asOf);
  const evidenceUrls =
    asset.evidenceUrls && asset.evidenceUrls.length > 0
      ? asset.evidenceUrls
      : asset.evidenceUrl
        ? [asset.evidenceUrl]
        : [];

  return {
    id: asset.id,
    assetId: asset.assetCode,
    assetCode: asset.assetCode,
    assetName: asset.assetName,
    assetType: asset.assetType,
    purchaseCost: cost,
    bookValue: dep.bookValue,
    purchaseDate: dateToIsoDate(asset.purchaseDate),
    vendor: asset.vendor,
    evidenceUrl: evidenceUrls[0] ?? asset.evidenceUrl ?? null,
    evidenceUrls,
    depreciationMethod: asset.depreciationMethod,
    depreciationPercentage: dep.depreciationPercentage,
    depreciationRate:
      asset.depreciationRate != null ? d(asset.depreciationRate) : null,
    usefulLife: asset.usefulLife,
    remainingUsefulLife: dep.remainingUsefulLife,
    residualValue: asset.residualValue != null ? d(asset.residualValue) : null,
    totalEstimatedUnit:
      asset.totalEstimatedUnit != null ? d(asset.totalEstimatedUnit) : null,
    unitProduced: asset.unitProduced != null ? d(asset.unitProduced) : null,
    depreciationPerUnit: dep.depreciationPerUnit,
    monthlyDepreciation: dep.monthlyDepreciation,
    accumulatedDepreciation: dep.accumulatedDepreciation,
    annualDepreciation: dep.annualDepreciation,
    serialNumber: asset.serialNumber,
    assetLocation: asset.assetLocation,
    additionalNote: asset.additionalNote,
    assignToConsultant: asset.assignToConsultant,
    assignedConsultantId: asset.assignedConsultantId ?? null,
    consultantReviewStatus: asset.consultantReviewStatus,
    status: asset.status,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
  };
}

export const assetsService = {
  async summary(userId: string) {
    const [assets, pendingCustomerReviews, current] = await Promise.all([
      prisma.asset.findMany({
        where: { userId, status: { in: [...ASSET_ON_BOOKS_STATUSES] } },
      }),
      prisma.asset.count({
        where: {
          userId,
          assignToConsultant: true,
          consultantReviewStatus: { in: [...CONSULTANT_REVIEW_OPEN_STATUSES] },
        },
      }),
      buildCurrentAssetsSnapshot(userId),
    ]);

    const now = new Date();
    let netNonCurrentAssets = 0;
    for (const a of assets) {
      netNonCurrentAssets += depFromAsset(a, now).bookValue;
    }

    const currentAssets = current.totalCurrentAssets;
    const netNonCurrent = normalizeMoneyAmount(netNonCurrentAssets);

    return {
      totalAssetValue: normalizeMoneyAmount(currentAssets + netNonCurrent),
      currentAssets,
      netNonCurrentAssets: netNonCurrent,
      pendingCustomerReviews,
    };
  },

  async create(
    userId: string,
    data: {
      assetType: string;
      assetName: string;
      purchaseDate: string;
      purchaseCost: number;
      vendor?: string;
      evidenceUrl?: string;
      depreciationMethod: string;
      usefulLife?: number;
      depreciationRate?: number;
      residualValue: number;
      totalEstimatedUnit?: number;
      unitProduced?: number;
      serialNumber?: string;
      assetLocation?: string;
      additionalNote?: string;
      assignToConsultant?: boolean;
    },
  ) {
    assertMonetaryAmountInRange(data.purchaseCost, "purchaseCost");
    assertMonetaryAmountInRange(data.residualValue, "residualValue");
    if (data.depreciationRate != null) {
      assertMonetaryAmountInRange(data.depreciationRate, "depreciationRate");
    }

    const method = assertAssetDepreciationInput({
      purchaseCost: data.purchaseCost,
      depreciationMethod: data.depreciationMethod,
      usefulLife: data.usefulLife,
      residualValue: data.residualValue,
      depreciationRate: data.depreciationRate,
      totalEstimatedUnit: data.totalEstimatedUnit,
      unitProduced: data.unitProduced,
    });

    const assignToConsultant = data.assignToConsultant === true;
    const assetCode = await nextCodedNumber(ASSET_COUNTER_ID, "AST");
    const evidenceUrl = data.evidenceUrl?.trim() || null;
    const purchaseDate = parseDateOnly(data.purchaseDate);
    const asset = await prisma.$transaction(async (tx) => {
      const row = await tx.asset.create({
        data: {
          userId,
          assetCode,
          assetType: data.assetType,
          assetName: data.assetName.trim(),
          purchaseDate,
          purchaseCost: dec(data.purchaseCost),
          vendor: data.vendor?.trim() || null,
          evidenceUrl,
          evidenceUrls: evidenceUrl ? [evidenceUrl] : [],
          depreciationMethod: method,
          usefulLife: data.usefulLife ?? null,
          depreciationRate:
            data.depreciationRate != null ? dec(data.depreciationRate) : null,
          residualValue: dec(data.residualValue),
          totalEstimatedUnit:
            data.totalEstimatedUnit != null
              ? dec(data.totalEstimatedUnit)
              : null,
          unitProduced:
            data.unitProduced != null ? dec(data.unitProduced) : null,
          serialNumber: data.serialNumber?.trim() || null,
          assetLocation: data.assetLocation?.trim() || null,
          additionalNote: data.additionalNote?.trim() || null,
          assignToConsultant,
          consultantReviewStatus: assignToConsultant
            ? CONSULTANT_REVIEW_STATUS.AWAITING
            : null,
          status: assignToConsultant
            ? ASSET_STATUS.AWAITING
            : ASSET_STATUS.ACTIVE,
        },
      });
      await appendAssetHistory(tx, {
        userId,
        assetId: row.id,
        type: "ASSET_ACQUIRED",
        eventDate: purchaseDate,
        details: {
          assetName: row.assetName,
          vendor: row.vendor,
          purchaseCost: data.purchaseCost,
          depreciationMethod: method,
          assignedEmployee: null,
        },
      });
      return row;
    });
    await ledgerPostingService.postAssetPurchase(
      userId,
      asset.id,
      data.purchaseCost,
      purchaseDate,
    );
    return mapAssetRow(asset);
  },

  async update(
    userId: string,
    assetId: string,
    data: Partial<{
      assetType: string;
      assetName: string;
      purchaseDate: string;
      purchaseCost: number;
      vendor: string | null;
      evidenceUrl: string | null;
      depreciationMethod: string | null;
      usefulLife: number | null;
      depreciationRate: number | null;
      residualValue: number | null;
      totalEstimatedUnit: number | null;
      unitProduced: number | null;
      serialNumber: string | null;
      assetLocation: string | null;
      additionalNote: string | null;
      assignToConsultant: boolean;
    }>,
  ) {
    const existing = await prisma.asset.findFirst({
      where: { id: assetId, userId },
    });
    if (!existing) return null;
    if (!isAssetOnBooks(existing.status)) {
      throw new HttpReplyError(
        400,
        `Cannot update asset with status ${existing.status}`,
      );
    }

    if (data.purchaseCost != null) {
      assertMonetaryAmountInRange(data.purchaseCost, "purchaseCost");
    }
    if (data.residualValue != null) {
      assertMonetaryAmountInRange(data.residualValue, "residualValue");
    }
    if (data.depreciationRate != null) {
      assertMonetaryAmountInRange(data.depreciationRate, "depreciationRate");
    }

    const nextPurchaseCost =
      data.purchaseCost != null ? data.purchaseCost : d(existing.purchaseCost);
    const nextMethodRaw =
      data.depreciationMethod !== undefined
        ? data.depreciationMethod
        : existing.depreciationMethod;
    const nextUsefulLife =
      data.usefulLife !== undefined ? data.usefulLife : existing.usefulLife;
    const nextResidual =
      data.residualValue !== undefined
        ? data.residualValue
        : existing.residualValue != null
          ? d(existing.residualValue)
          : null;
    const nextRate =
      data.depreciationRate !== undefined
        ? data.depreciationRate
        : existing.depreciationRate != null
          ? d(existing.depreciationRate)
          : null;
    const nextTotalUnits =
      data.totalEstimatedUnit !== undefined
        ? data.totalEstimatedUnit
        : existing.totalEstimatedUnit != null
          ? d(existing.totalEstimatedUnit)
          : null;
    const nextUnitProduced =
      data.unitProduced !== undefined
        ? data.unitProduced
        : existing.unitProduced != null
          ? d(existing.unitProduced)
          : null;

    if (nextMethodRaw != null && String(nextMethodRaw).trim() !== "") {
      assertAssetDepreciationInput({
        purchaseCost: nextPurchaseCost,
        depreciationMethod: nextMethodRaw,
        usefulLife: nextUsefulLife,
        residualValue: nextResidual,
        depreciationRate: nextRate,
        totalEstimatedUnit: nextTotalUnits,
        unitProduced: nextUnitProduced,
      });
    }

    const updateData: Record<string, unknown> = {};
    if (data.assetType != null) updateData.assetType = data.assetType;
    if (data.assetName != null) updateData.assetName = data.assetName.trim();
    if (data.purchaseDate != null) {
      updateData.purchaseDate = parseDateOnly(data.purchaseDate);
    }
    if (data.purchaseCost != null) {
      updateData.purchaseCost = dec(data.purchaseCost);
    }
    if (data.vendor !== undefined) {
      updateData.vendor = data.vendor?.trim() || null;
    }
    if (data.evidenceUrl !== undefined) {
      const url = data.evidenceUrl?.trim() || null;
      updateData.evidenceUrl = url;
      if (url) {
        const existingUrls = existing.evidenceUrls ?? [];
        if (!existingUrls.includes(url)) {
          updateData.evidenceUrls = [...existingUrls, url];
        }
      }
    }
    if (data.depreciationMethod !== undefined) {
      updateData.depreciationMethod = data.depreciationMethod
        ? normalizeDepreciationMethod(data.depreciationMethod)
        : null;
    }
    if (data.usefulLife !== undefined) updateData.usefulLife = data.usefulLife;
    if (data.depreciationRate !== undefined) {
      updateData.depreciationRate =
        data.depreciationRate != null ? dec(data.depreciationRate) : null;
    }
    if (data.residualValue !== undefined) {
      updateData.residualValue =
        data.residualValue != null ? dec(data.residualValue) : null;
    }
    if (data.totalEstimatedUnit !== undefined) {
      updateData.totalEstimatedUnit =
        data.totalEstimatedUnit != null ? dec(data.totalEstimatedUnit) : null;
    }
    if (data.unitProduced !== undefined) {
      updateData.unitProduced =
        data.unitProduced != null ? dec(data.unitProduced) : null;
    }
    if (data.serialNumber !== undefined) {
      updateData.serialNumber = data.serialNumber?.trim() || null;
    }
    if (data.assetLocation !== undefined) {
      updateData.assetLocation = data.assetLocation?.trim() || null;
    }
    if (data.additionalNote !== undefined) {
      updateData.additionalNote = data.additionalNote?.trim() || null;
    }
    if (data.assignToConsultant !== undefined) {
      updateData.assignToConsultant = data.assignToConsultant;
      if (data.assignToConsultant === true) {
        if (!existing.consultantReviewStatus) {
          updateData.consultantReviewStatus =
            CONSULTANT_REVIEW_STATUS.AWAITING;
        }
        if (isAssetOnBooks(existing.status)) {
          updateData.status = ASSET_STATUS.AWAITING;
        }
      } else if (data.assignToConsultant === false) {
        updateData.consultantReviewStatus = null;
        updateData.assignedConsultantId = null;
        if (isAssetInReviewStatus(existing.status)) {
          updateData.status = ASSET_STATUS.ACTIVE;
        }
      }
    }

    if (Object.keys(updateData).length === 0) {
      return mapAssetRow(existing);
    }

    const updated = await prisma.asset.update({
      where: { id: assetId },
      data: updateData,
    });
    return mapAssetRow(updated);
  },

  async list(
    userId: string,
    opts?: {
      page?: number;
      limit?: number;
      assetType?: string;
      status?: string;
    },
  ) {
    const page = opts?.page ?? 1;
    const limit = Math.min(Math.max(1, opts?.limit ?? 20), 100);
    const where: {
      userId: string;
      assetType?: string;
      status?: string;
    } = { userId };
    if (opts?.assetType?.trim()) where.assetType = opts.assetType.trim();
    if (opts?.status?.trim()) where.status = opts.status.trim();

    const [rows, total, pendingReviews] = await Promise.all([
      prisma.asset.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.asset.count({ where }),
      prisma.asset.count({
        where: {
          userId,
          assignToConsultant: true,
          consultantReviewStatus: { in: [...CONSULTANT_REVIEW_OPEN_STATUSES] },
        },
      }),
    ]);

    const now = new Date();
    const assets = rows.map((a) => mapAssetRow(a, now));
    const totalNetBookValue = normalizeMoneyAmount(
      assets.reduce((s, a) => s + a.bookValue, 0),
    );

    return {
      summary: {
        totalAssets: total,
        totalNetBookValue,
        pendingReviews,
      },
      assets,
      pagination: {
        page,
        limit,
        totalRecords: total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  },

  async getById(userId: string, assetId: string) {
    const asset = await prisma.asset.findFirst({
      where: { id: assetId, userId },
    });
    if (!asset) return null;
    return mapAssetRow(asset);
  },

  async dashboard(userId: string) {
    const [assets, pendingReviews, current] = await Promise.all([
      prisma.asset.findMany({
        where: { userId, status: { in: [...ASSET_ON_BOOKS_STATUSES] } },
      }),
      prisma.asset.count({
        where: {
          userId,
          assignToConsultant: true,
          consultantReviewStatus: { in: [...CONSULTANT_REVIEW_OPEN_STATUSES] },
        },
      }),
      buildCurrentAssetsSnapshot(userId),
    ]);

    const now = new Date();
    let totalCost = 0;
    let nonCurrentNetBookValue = 0;
    let annualDepreciation = 0;
    let softwareAmortization = 0;
    const costByType = new Map<string, number>();
    for (const t of ASSET_TYPES) costByType.set(t, 0);

    for (const a of assets) {
      const cost = d(a.purchaseCost);
      totalCost += cost;
      costByType.set(a.assetType, (costByType.get(a.assetType) ?? 0) + cost);
      const dep = depFromAsset(a, now);
      nonCurrentNetBookValue += dep.bookValue;
      annualDepreciation += dep.annualDepreciation;
      if (a.assetType === "SOFTWARE_LICENSES") {
        softwareAmortization += dep.annualDepreciation;
      }
    }

    const nonCurrentAssetCategories = ASSET_TYPES.map((assetType) => {
      const cost = normalizeMoneyAmount(costByType.get(assetType) ?? 0);
      return {
        assetType,
        cost,
        percentage:
          totalCost > 0
            ? normalizeMoneyAmount((cost / totalCost) * PERCENT)
            : 0,
      };
    });

    return {
      summary: {
        pendingReviews,
        currentAssets: current.totalCurrentAssets,
        nonCurrentAssets: normalizeMoneyAmount(nonCurrentNetBookValue),
        annualDepreciation: normalizeMoneyAmount(annualDepreciation),
        cash: current.cash.total,
        bankBalances: current.bankBalances.total,
        inventory: current.inventory.total,
        accountsReceivable: current.accountsReceivable.total,
      },
      nonCurrentAssetCategories,
      plImpact: {
        annualDepreciationCharge: normalizeMoneyAmount(annualDepreciation),
        softwareAmortization: normalizeMoneyAmount(softwareAmortization),
        capitalAllowance: 0,
        netTaxBenefit: 0,
      },
    };
  },

  async currentAssets(userId: string) {
    const snapshot = await buildCurrentAssetsSnapshot(userId);
    return {
      totalCurrentAssets: snapshot.totalCurrentAssets,
      cash: snapshot.cash,
      bankBalances: snapshot.bankBalances,
      inventory: snapshot.inventory,
      accountsReceivable: snapshot.accountsReceivable,
      prepayments: snapshot.prepayments,
    };
  },

  /** Shared snapshot for reports / other callers. */
  async getCurrentAssetsSnapshot(userId: string) {
    return buildCurrentAssetsSnapshot(userId);
  },

  async nonCurrentAssets(userId: string) {
    const assets = await prisma.asset.findMany({
      where: { userId, status: { in: [...ASSET_ON_BOOKS_STATUSES] } },
      orderBy: { assetName: "asc" },
    });
    const now = new Date();
    const byType = new Map<
      string,
      Array<{
        assetId: string;
        name: string;
        assetLocation: string | null;
        amount: number;
      }>
    >();
    for (const t of ASSET_TYPES) byType.set(t, []);

    let purchaseCost = 0;
    let accumulatedDepreciation = 0;
    let netNonCurrentAssets = 0;
    for (const a of assets) {
      const cost = d(a.purchaseCost);
      const dep = depFromAsset(a, now);
      purchaseCost += cost;
      accumulatedDepreciation += dep.accumulatedDepreciation;
      netNonCurrentAssets += dep.bookValue;
      const list = byType.get(a.assetType) ?? [];
      list.push({
        assetId: a.assetCode,
        name: a.assetName,
        assetLocation: a.assetLocation,
        amount: dep.bookValue,
      });
      byType.set(a.assetType, list);
    }

    const net = normalizeMoneyAmount(netNonCurrentAssets);

    return {
      total: net,
      purchaseCost: normalizeMoneyAmount(purchaseCost),
      accumulatedDepreciation: normalizeMoneyAmount(accumulatedDepreciation),
      netNonCurrentAssets: net,
      categories: ASSET_TYPES.map((assetType) => {
        const rows = byType.get(assetType) ?? [];
        return {
          assetType,
          total: normalizeMoneyAmount(rows.reduce((s, r) => s + r.amount, 0)),
          assets: rows,
        };
      }),
    };
  },

  async depreciationAmortization(userId: string) {
    const assets = await prisma.asset.findMany({
      where: { userId, status: { in: [...ASSET_ON_BOOKS_STATUSES] } },
      orderBy: { assetName: "asc" },
    });
    const now = new Date();
    const rows = assets.map((a) => {
      const dep = depFromAsset(a, now);
      return {
        assetId: a.assetCode,
        name: a.assetName,
        assetType: a.assetType,
        depreciationPercentage: dep.depreciationPercentage,
        depreciationMethod: a.depreciationMethod,
        accumulatedDepreciation: dep.accumulatedDepreciation,
        bookValue: dep.bookValue,
        remainingUsefulLife: dep.remainingUsefulLife,
        annualDepreciation: dep.annualDepreciation,
      };
    });

    return {
      total: normalizeMoneyAmount(
        rows.reduce((s, r) => s + r.accumulatedDepreciation, 0),
      ),
      assets: rows,
    };
  },

  async createTransfer(
    userId: string,
    data: {
      assetId: string;
      transferType: string;
      fromLocation: string;
      toLocation: string;
      transferDate: string;
      reason: string;
    },
  ) {
    const asset = await findOwnedAsset(userId, data.assetId);
    if (!asset) throw new HttpReplyError(400, "Asset not found");
    if (!isAssetOnBooks(asset.status)) {
      throw new HttpReplyError(
        400,
        `Cannot transfer asset with status ${asset.status}`,
      );
    }

    const pending = await prisma.assetTransfer.findFirst({
      where: {
        userId,
        assetId: asset.id,
        status: TRANSFER_STATUSES[0],
      },
    });
    if (pending) {
      throw new HttpReplyError(
        409,
        "Asset already has a pending transfer",
      );
    }

    const transferCode = await nextCodedNumber(TRANSFER_COUNTER_ID, "TRF");
    const transferDate = parseDateOnly(data.transferDate);
    const transfer = await prisma.$transaction(async (tx) => {
      const row = await tx.assetTransfer.create({
        data: {
          userId,
          transferCode,
          assetId: asset.id,
          transferType: data.transferType,
          fromLocation: data.fromLocation.trim(),
          toLocation: data.toLocation.trim(),
          transferDate,
          reason: data.reason.trim(),
          status: TRANSFER_STATUSES[0],
        },
      });
      await appendAssetHistory(tx, {
        userId,
        assetId: asset.id,
        type: "ASSET_TRANSFER",
        eventDate: transferDate,
        details: {
          fromLocation: row.fromLocation,
          toLocation: row.toLocation,
          transferType: row.transferType,
          status: row.status,
          reason: row.reason,
        },
      });
      return row;
    });

    return {
      id: transfer.id,
      transferId: transfer.transferCode,
      assetId: asset.assetCode,
      assetName: asset.assetName,
      assetType: asset.assetType,
      transferType: transfer.transferType,
      status: transfer.status,
      fromLocation: transfer.fromLocation,
      toLocation: transfer.toLocation,
      transferDate: dateToIsoDate(transfer.transferDate),
      reason: transfer.reason,
    };
  },

  async listTransfers(
    userId: string,
    opts?: { page?: number; limit?: number; status?: string },
  ) {
    const page = opts?.page ?? 1;
    const limit = Math.min(Math.max(1, opts?.limit ?? 20), 100);
    const where: { userId: string; status?: string } = { userId };
    if (opts?.status?.trim()) where.status = opts.status.trim();

    const [rows, total] = await Promise.all([
      prisma.assetTransfer.findMany({
        where,
        include: {
          asset: {
            select: {
              assetCode: true,
              assetName: true,
              assetType: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.assetTransfer.count({ where }),
    ]);

    return {
      summary: { totalTransfers: total },
      transfers: rows.map((t) => ({
        id: t.id,
        transferId: t.transferCode,
        assetId: t.asset.assetCode,
        assetName: t.asset.assetName,
        assetType: t.asset.assetType,
        transferType: t.transferType,
        status: t.status,
        fromLocation: t.fromLocation,
        toLocation: t.toLocation,
        transferDate: dateToIsoDate(t.transferDate),
        reason: t.reason,
      })),
      pagination: {
        page,
        limit,
        totalRecords: total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  },

  async updateTransfer(
    userId: string,
    transferId: string,
    data: Partial<{
      transferType: string;
      fromLocation: string;
      toLocation: string;
      transferDate: string;
      reason: string;
    }>,
  ) {
    const existing = await prisma.assetTransfer.findFirst({
      where: { id: transferId, userId },
      include: {
        asset: {
          select: { assetCode: true, assetName: true, assetType: true },
        },
      },
    });
    if (!existing) return null;
    if (existing.status !== TRANSFER_STATUSES[0]) {
      throw new HttpReplyError(
        400,
        "Only pending transfers can be updated",
      );
    }

    const updateData: Record<string, unknown> = {};
    if (data.transferType != null) updateData.transferType = data.transferType;
    if (data.fromLocation != null) {
      updateData.fromLocation = data.fromLocation.trim();
    }
    if (data.toLocation != null) {
      updateData.toLocation = data.toLocation.trim();
    }
    if (data.transferDate != null) {
      updateData.transferDate = parseDateOnly(data.transferDate);
    }
    if (data.reason != null) updateData.reason = data.reason.trim();

    const updated =
      Object.keys(updateData).length === 0
        ? existing
        : await prisma.assetTransfer.update({
            where: { id: transferId },
            data: updateData,
            include: {
              asset: {
                select: {
                  assetCode: true,
                  assetName: true,
                  assetType: true,
                },
              },
            },
          });

    return {
      id: updated.id,
      transferId: updated.transferCode,
      assetId: updated.asset.assetCode,
      assetName: updated.asset.assetName,
      assetType: updated.asset.assetType,
      transferType: updated.transferType,
      status: updated.status,
      fromLocation: updated.fromLocation,
      toLocation: updated.toLocation,
      transferDate: dateToIsoDate(updated.transferDate),
      reason: updated.reason,
    };
  },

  async approveTransfer(userId: string, transferId: string) {
    return prisma.$transaction(async (tx) => {
      const transfer = await findOwnedTransfer(tx, userId, transferId);
      if (!transfer) return null;
      if (transfer.status !== TRANSFER_STATUSES[0]) {
        throw new HttpReplyError(400, "Only pending transfers can be approved");
      }
      if (!isAssetOnBooks(transfer.asset.status)) {
        throw new HttpReplyError(
          400,
          `Cannot approve transfer for asset with status ${transfer.asset.status}`,
        );
      }

      const updated = await tx.assetTransfer.update({
        where: { id: transfer.id },
        data: { status: TRANSFER_STATUSES[1] },
      });
      await tx.asset.update({
        where: { id: transfer.assetId },
        data: { assetLocation: transfer.toLocation },
      });

      // History is written on create; if missing (legacy), record completion now.
      const alreadyLogged = await tx.assetHistory.findFirst({
        where: {
          userId,
          assetId: transfer.assetId,
          type: "ASSET_TRANSFER",
          eventDate: transfer.transferDate,
        },
      });
      if (!alreadyLogged) {
        await appendAssetHistory(tx, {
          userId,
          assetId: transfer.assetId,
          type: "ASSET_TRANSFER",
          eventDate: transfer.transferDate,
          details: {
            fromLocation: transfer.fromLocation,
            toLocation: transfer.toLocation,
            transferType: transfer.transferType,
            status: TRANSFER_STATUSES[1],
          },
        });
      }

      return {
        id: updated.id,
        transferId: updated.transferCode,
        assetId: transfer.asset.assetCode,
        assetName: transfer.asset.assetName,
        assetType: transfer.asset.assetType,
        transferType: updated.transferType,
        status: updated.status,
        fromLocation: updated.fromLocation,
        toLocation: updated.toLocation,
        transferDate: dateToIsoDate(updated.transferDate),
        reason: updated.reason,
      };
    });
  },

  async rejectTransfer(userId: string, transferId: string) {
    const transfer = await findOwnedTransfer(prisma, userId, transferId);
    if (!transfer) return null;
    if (transfer.status !== TRANSFER_STATUSES[0]) {
      throw new HttpReplyError(400, "Only pending transfers can be rejected");
    }

    const updated = await prisma.assetTransfer.update({
      where: { id: transfer.id },
      data: { status: TRANSFER_STATUSES[2] },
    });

    return {
      id: updated.id,
      transferId: updated.transferCode,
      assetId: transfer.asset.assetCode,
      assetName: transfer.asset.assetName,
      assetType: transfer.asset.assetType,
      transferType: updated.transferType,
      status: updated.status,
      fromLocation: updated.fromLocation,
      toLocation: updated.toLocation,
      transferDate: dateToIsoDate(updated.transferDate),
      reason: updated.reason,
    };
  },

  async createSale(
    userId: string,
    data: {
      assetId: string;
      saleDate: string;
      salePrice: number;
      buyer: string;
    },
  ) {
    assertMonetaryAmountInRange(data.salePrice, "salePrice");

    const asset = await findOwnedAsset(userId, data.assetId);
    if (!asset) throw new HttpReplyError(400, "Asset not found");
    if (!isAssetOnBooks(asset.status)) {
      throw new HttpReplyError(
        400,
        `Cannot sell asset with status ${asset.status}`,
      );
    }

    const saleDate = parseDateOnly(data.saleDate);
    const dep = depFromAsset(asset, saleDate);
    const bookValue = dep.bookValue;
    const { gainLossType, gainLossAmount } = deriveGainLoss(
      data.salePrice,
      bookValue,
    );

    const saleCode = await nextCodedNumber(SALE_COUNTER_ID, "SAL");
    const sale = await prisma.$transaction(async (tx) => {
      const row = await tx.assetSale.create({
        data: {
          userId,
          saleCode,
          assetId: asset.id,
          saleDate,
          salePrice: dec(data.salePrice),
          buyer: data.buyer.trim(),
          bookValueAtSale: dec(bookValue),
          gainLossType,
          gainLossAmount: dec(gainLossAmount),
        },
      });
      await tx.asset.update({
        where: { id: asset.id },
        data: { status: ASSET_STATUS.SOLD },
      });
      await tx.assetTransfer.updateMany({
        where: {
          assetId: asset.id,
          status: TRANSFER_STATUSES[0],
        },
        data: { status: TRANSFER_STATUSES[2] },
      });
      return row;
    });

    return {
      id: sale.id,
      saleId: sale.saleCode,
      assetId: asset.assetCode,
      assetName: asset.assetName,
      assetType: asset.assetType,
      buyer: sale.buyer,
      saleDate: dateToIsoDate(sale.saleDate),
      salePrice: d(sale.salePrice),
      bookValue: d(sale.bookValueAtSale),
      gainLossType: sale.gainLossType,
      gainLossAmount: d(sale.gainLossAmount),
    };
  },

  async listSales(
    userId: string,
    opts?: { page?: number; limit?: number },
  ) {
    const page = opts?.page ?? 1;
    const limit = Math.min(Math.max(1, opts?.limit ?? 20), 100);
    const where = { userId };

    const [rows, total, agg] = await Promise.all([
      prisma.assetSale.findMany({
        where,
        include: {
          asset: {
            select: { assetCode: true, assetName: true, assetType: true },
          },
        },
        orderBy: { saleDate: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.assetSale.count({ where }),
      prisma.assetSale.aggregate({
        where,
        _sum: { salePrice: true },
      }),
    ]);

    return {
      summary: {
        totalSales: total,
        totalSaleValue: normalizeMoneyAmount(d(agg._sum.salePrice)),
      },
      sales: rows.map((s) => ({
        id: s.id,
        saleId: s.saleCode,
        assetId: s.asset.assetCode,
        assetName: s.asset.assetName,
        assetType: s.asset.assetType,
        buyer: s.buyer,
        saleDate: dateToIsoDate(s.saleDate),
        salePrice: d(s.salePrice),
        bookValue: d(s.bookValueAtSale),
        gainLossType: s.gainLossType,
        gainLossAmount: d(s.gainLossAmount),
      })),
      pagination: {
        page,
        limit,
        totalRecords: total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  },

  async createDisposal(
    userId: string,
    data: {
      assetId: string;
      disposalReason: string;
      disposalDate: string;
      note: string;
      evidenceUrl?: string;
    },
  ) {
    const asset = await findOwnedAsset(userId, data.assetId);
    if (!asset) throw new HttpReplyError(400, "Asset not found");
    if (!isAssetOnBooks(asset.status)) {
      throw new HttpReplyError(
        400,
        `Cannot dispose asset with status ${asset.status}`,
      );
    }

    const disposalDate = parseDateOnly(data.disposalDate);
    const dep = depFromAsset(asset, disposalDate);

    const disposalCode = await nextCodedNumber(DISPOSAL_COUNTER_ID, "DSP");
    const disposal = await prisma.$transaction(async (tx) => {
      const row = await tx.assetDisposal.create({
        data: {
          userId,
          disposalCode,
          assetId: asset.id,
          disposalReason: data.disposalReason,
          disposalDate,
          note: data.note.trim(),
          evidenceUrl: data.evidenceUrl?.trim() || null,
          bookValueAtDisposal: dec(dep.bookValue),
        },
      });
      await tx.asset.update({
        where: { id: asset.id },
        data: { status: ASSET_STATUS.DISPOSED },
      });
      await tx.assetTransfer.updateMany({
        where: {
          assetId: asset.id,
          status: TRANSFER_STATUSES[0],
        },
        data: { status: TRANSFER_STATUSES[2] },
      });
      await appendAssetHistory(tx, {
        userId,
        assetId: asset.id,
        type: "ASSET_DISPOSAL",
        eventDate: disposalDate,
        details: {
          disposalReason: data.disposalReason,
          note: data.note.trim(),
        },
      });
      return row;
    });

    return {
      id: disposal.id,
      disposalId: disposal.disposalCode,
      assetId: asset.assetCode,
      assetName: asset.assetName,
      assetType: asset.assetType,
      disposalReason: disposal.disposalReason,
      disposalDate: dateToIsoDate(disposal.disposalDate),
      bookValueAtDisposal: d(disposal.bookValueAtDisposal),
      note: disposal.note,
      hasEvidence: Boolean(disposal.evidenceUrl),
      evidenceUrl: disposal.evidenceUrl,
    };
  },

  async listDisposals(
    userId: string,
    opts?: { page?: number; limit?: number },
  ) {
    const page = opts?.page ?? 1;
    const limit = Math.min(Math.max(1, opts?.limit ?? 20), 100);
    const where = { userId };

    const [rows, total, agg] = await Promise.all([
      prisma.assetDisposal.findMany({
        where,
        include: {
          asset: {
            select: { assetCode: true, assetName: true, assetType: true },
          },
        },
        orderBy: { disposalDate: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.assetDisposal.count({ where }),
      prisma.assetDisposal.aggregate({
        where,
        _sum: { bookValueAtDisposal: true },
      }),
    ]);

    return {
      summary: {
        totalDisposals: total,
        totalBookValueAtDisposal: normalizeMoneyAmount(
          d(agg._sum.bookValueAtDisposal),
        ),
      },
      disposals: rows.map((r) => ({
        id: r.id,
        disposalId: r.disposalCode,
        assetId: r.asset.assetCode,
        assetName: r.asset.assetName,
        assetType: r.asset.assetType,
        disposalReason: r.disposalReason,
        disposalDate: dateToIsoDate(r.disposalDate),
        bookValueAtDisposal: d(r.bookValueAtDisposal),
        note: r.note,
        hasEvidence: Boolean(r.evidenceUrl),
      })),
      pagination: {
        page,
        limit,
        totalRecords: total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  },

  async updateDisposal(
    userId: string,
    disposalId: string,
    data: Partial<{
      disposalReason: string;
      disposalDate: string;
      note: string;
      evidenceUrl: string | null;
    }>,
  ) {
    const existing = await prisma.assetDisposal.findFirst({
      where: { id: disposalId, userId },
      include: {
        asset: {
          select: { assetCode: true, assetName: true, assetType: true },
        },
      },
    });
    if (!existing) return null;

    const updateData: Record<string, unknown> = {};
    if (data.disposalReason != null) {
      updateData.disposalReason = data.disposalReason;
    }
    if (data.disposalDate != null) {
      updateData.disposalDate = parseDateOnly(data.disposalDate);
    }
    if (data.note != null) updateData.note = data.note.trim();
    if (data.evidenceUrl !== undefined) {
      updateData.evidenceUrl = data.evidenceUrl?.trim() || null;
    }

    const updated =
      Object.keys(updateData).length === 0
        ? existing
        : await prisma.assetDisposal.update({
            where: { id: disposalId },
            data: updateData,
            include: {
              asset: {
                select: {
                  assetCode: true,
                  assetName: true,
                  assetType: true,
                },
              },
            },
          });

    return {
      id: updated.id,
      disposalId: updated.disposalCode,
      assetId: updated.asset.assetCode,
      assetName: updated.asset.assetName,
      assetType: updated.asset.assetType,
      disposalReason: updated.disposalReason,
      disposalDate: dateToIsoDate(updated.disposalDate),
      bookValueAtDisposal: d(updated.bookValueAtDisposal),
      note: updated.note,
      hasEvidence: Boolean(updated.evidenceUrl),
      evidenceUrl: updated.evidenceUrl,
    };
  },
};
