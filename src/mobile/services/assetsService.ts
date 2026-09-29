import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import {
  ASSET_EVENT_STATUS,
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
import { computeInventoryLineValue } from "../../constants/inventory";
import { HttpReplyError } from "../../utils/httpReplyError";
import { lagosYear } from "../../utils/lagosCalendar";
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
import { CAPITAL_ALLOWANCE_TABLE_I } from "../../constants/capitalAllowance";
import { capitalAllowanceService } from "./capitalAllowanceService";
import {
  syncSaleRecord,
} from "./moduleSyncService";
import { RECEIVABLE_TYPES } from "../../constants/receivables";
import { cashBankService } from "./cashBankService";
import { LEDGER_ACCOUNTS } from "../../constants/ledger";
import { ledgerService } from "../../services/ledgerService";
import {
  RECORD_UNDO_STATUS,
  isUndoneStatus,
  mapUndoPayload,
} from "../../constants/recordUndo";
import {
  isLiveUserAddedStatus,
  mapCurrentAssetBankItem,
  mapCurrentAssetCashItem,
} from "./currentAssetUndoService";
import { mapCurrentAssetReceivableItem } from "./receivableUndoService";

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
 * - Inventory: on-hand qty × purchaseCost (active items only; excludes soft-deleted)
 */
async function buildCurrentAssetsSnapshot(userId: string) {
  const [inventoryItems, unpaidSales, business, userCash, userBanks, receivableRows, ledgerBalances] =
    await Promise.all([
      prisma.inventoryItem.findMany({
        where: { userId, deletedAt: null, quantity: { gt: 0 } },
      }),
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

  const inventoryRows = inventoryItems.map((it) => {
    const quantity = d(it.quantity);
    const amount = normalizeMoneyAmount(
      computeInventoryLineValue(quantity, d(it.purchaseCost)),
    );
    return {
      stockName: it.name,
      amount,
      quantity,
    };
  });

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

  const userAddedArItems = receivableRows.map((r) =>
    mapCurrentAssetReceivableItem(r),
  );
  const liveUserAddedArItems = userAddedArItems.filter(
    (r) => !isUndoneStatus(String(r.status)),
  );

  const liveReceivableRows = receivableRows.filter(
    (r) => isLiveUserAddedStatus(r.recordStatus),
  );

  const sumOutstandingByType = (type: string) =>
    normalizeMoneyAmount(
      liveReceivableRows
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
    liveUserAddedArItems.reduce(
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

  const userCashItems = userCash.map((c) => mapCurrentAssetCashItem(c));
  const liveUserCashItems = userCashItems.filter((c) =>
    isLiveUserAddedStatus(c.status),
  );

  const userBankItems = userBanks.map((b) =>
    mapCurrentAssetBankItem(
      b,
      balanceByCode.get(`${LEDGER_ACCOUNTS.BANK}:${b.bankCode}`) ??
        Number(b.openingBalance),
    ),
  );
  const liveUserBankItems = userBankItems.filter((b) =>
    isLiveUserAddedStatus(b.status),
  );

  const userCashFromRegisters = normalizeMoneyAmount(
    liveUserCashItems.reduce((s, r) => s + r.amount, 0),
  );
  const userBankFromRegisters = normalizeMoneyAmount(
    liveUserBankItems.reduce((s, r) => s + r.amount, 0),
  );

  const CASH_LEDGER_LABELS: Record<string, { title: string; subtitle: string }> =
    {
      [LEDGER_ACCOUNTS.CASH_ON_HAND]: {
        title: "Cash on hand",
        subtitle: "Ledger cash from sales, expenses, and collections",
      },
      [LEDGER_ACCOUNTS.PETTY_CASH]: {
        title: "Petty cash",
        subtitle: "Ledger petty cash balance",
      },
      [LEDGER_ACCOUNTS.OTHER_CASH]: {
        title: "Other cash",
        subtitle: "Ledger other cash balance",
      },
    };

  const systemCashItems = ledgerBalances
    .filter((row) => isCashLedgerCode(row.accountCode) && row.balance > 0)
    .map((row) => {
      const labels = CASH_LEDGER_LABELS[row.accountCode] ?? {
        title: row.accountCode,
        subtitle: "Ledger cash balance",
      };
      return {
        id: `system-${row.accountCode.toLowerCase().replace(/_/g, "-")}`,
        title: labels.title,
        subtitle: labels.subtitle,
        amount: normalizeMoneyAmount(row.balance),
        source: "system" as const,
      };
    });
  const systemCashBalance = normalizeMoneyAmount(
    systemCashItems.reduce((s, r) => s + r.amount, 0),
  );

  const accountNumber = business?.bankAccount?.trim() || "Not set";

  type SystemBankItem = {
    id: string;
    bankName: string;
    accountType: string;
    accountNumber: string;
    amount: number;
    source: "system";
  };

  const userBankLedgerCodes = new Set(
    userBanks.map((b) => `${LEDGER_ACCOUNTS.BANK}:${b.bankCode}`),
  );

  const systemBankItems: SystemBankItem[] = [];

  for (const row of ledgerBalances) {
    if (!isBankLedgerCode(row.accountCode)) continue;
    if (userBankLedgerCodes.has(row.accountCode)) continue;
    const amount = normalizeMoneyAmount(row.balance);
    if (amount <= 0) continue;

    if (row.accountCode === LEDGER_ACCOUNTS.CARD_SETTLEMENT) {
      systemBankItems.push({
        id: "card-settlement",
        bankName: "Card settlement",
        accountType: "Current",
        accountNumber: "Card processor balance",
        amount,
        source: "system",
      });
      continue;
    }

    if (row.accountCode === LEDGER_ACCOUNTS.BANK) {
      systemBankItems.push({
        id: "system-bank",
        bankName: business?.name?.trim()
          ? `${business.name.trim()} — primary`
          : "Primary bank account",
        accountType: "Current",
        accountNumber,
        amount,
        source: "system",
      });
      continue;
    }

    systemBankItems.push({
      id: `system-${row.accountCode.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      bankName: row.accountCode,
      accountType: "Current",
      accountNumber: row.accountCode,
      amount,
      source: "system",
    });
  }

  const systemBankBalance = normalizeMoneyAmount(
    systemBankItems.reduce((s, row) => s + row.amount, 0),
  );

  const cash = {
    total: normalizeMoneyAmount(systemCashBalance + userCashFromRegisters),
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
    total: normalizeMoneyAmount(systemBankBalance + userBankFromRegisters),
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

function buildAssetListStatusFilter(
  status?: string,
): string | { notIn: string[] } | undefined {
  const normalized = status?.trim();
  if (!normalized || normalized === "all") {
    return undefined;
  }
  if (
    normalized === RECORD_UNDO_STATUS.VOIDED ||
    normalized === "Voided"
  ) {
    return RECORD_UNDO_STATUS.VOIDED;
  }
  if (
    normalized === RECORD_UNDO_STATUS.REVERSED ||
    normalized === "Reversed"
  ) {
    return RECORD_UNDO_STATUS.REVERSED;
  }
  return normalized;
}

function buildAssetEventListStatusFilter(
  status?: string,
): string | { notIn: string[] } {
  const normalized = status?.trim() || "all";
  if (normalized === "all") {
    return { notIn: [ASSET_EVENT_STATUS.REVERSED] };
  }
  if (
    normalized === RECORD_UNDO_STATUS.REVERSED ||
    normalized === "Reversed"
  ) {
    return ASSET_EVENT_STATUS.REVERSED;
  }
  return ASSET_EVENT_STATUS.LIVE;
}

function buildAssetTransferListStatusFilter(
  status?: string,
): string | { notIn: string[] } {
  const normalized = status?.trim() || "all";
  if (normalized === "all") {
    return {
      notIn: [RECORD_UNDO_STATUS.VOIDED, RECORD_UNDO_STATUS.REVERSED],
    };
  }
  if (
    normalized === RECORD_UNDO_STATUS.VOIDED ||
    normalized === "Voided"
  ) {
    return RECORD_UNDO_STATUS.VOIDED;
  }
  if (
    normalized === RECORD_UNDO_STATUS.REVERSED ||
    normalized === "Reversed"
  ) {
    return RECORD_UNDO_STATUS.REVERSED;
  }
  return normalized;
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
    undoAt?: Date | null;
    undoReason?: string | null;
    reversingEntryId?: string | null;
    reversingEntryDate?: Date | null;
    expenditureType?: string | null;
    businessUsePercent?: { toNumber?: () => number } | number | string | null;
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
    expenditureType: asset.expenditureType ?? null,
    expenditureTypeLabel: asset.expenditureType
      ? capitalAllowanceService.expenditureTypeLabel(
          asset.expenditureType,
          CAPITAL_ALLOWANCE_TABLE_I.map((r) => ({
            id: r.expenditureType,
            label: r.expenditureTypeLabel,
          })),
        )
      : null,
    businessUsePercent:
      asset.businessUsePercent != null ? d(asset.businessUsePercent as never) : null,
    undo: mapUndoPayload(asset),
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
          status: {
            notIn: [RECORD_UNDO_STATUS.VOIDED, RECORD_UNDO_STATUS.REVERSED],
          },
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
      expenditureType: string;
      businessUsePercent: number;
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
          expenditureType: data.expenditureType,
          businessUsePercent: dec(data.businessUsePercent),
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
    const baseWhere: {
      userId: string;
      assetType?: string;
    } = { userId };
    if (opts?.assetType?.trim()) baseWhere.assetType = opts.assetType.trim();

    const liveWhere = {
      ...baseWhere,
      status: {
        notIn: [RECORD_UNDO_STATUS.VOIDED, RECORD_UNDO_STATUS.REVERSED],
      },
    };
    const statusFilter = buildAssetListStatusFilter(opts?.status);
    const listWhere = {
      ...baseWhere,
      ...(statusFilter != null ? { status: statusFilter } : {}),
    };

    const [rows, total, pendingReviews, liveRows, counts] = await Promise.all([
      prisma.asset.findMany({
        where: listWhere,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.asset.count({ where: listWhere }),
      prisma.asset.count({
        where: {
          userId,
          assignToConsultant: true,
          consultantReviewStatus: { in: [...CONSULTANT_REVIEW_OPEN_STATUSES] },
          status: {
            notIn: [RECORD_UNDO_STATUS.VOIDED, RECORD_UNDO_STATUS.REVERSED],
          },
        },
      }),
      prisma.asset.findMany({ where: liveWhere }),
      prisma.asset.groupBy({
        by: ["status"],
        where: baseWhere,
        _count: true,
      }),
    ]);

    const now = new Date();
    const assets = rows.map((a) => mapAssetRow(a, now));
    const totalNetBookValue = normalizeMoneyAmount(
      liveRows.reduce((s, a) => s + depFromAsset(a, now).bookValue, 0),
    );

    const dbCount = (s: string) =>
      counts.find((c) => c.status === s)?._count ?? 0;
    const totalAll = counts.reduce((s, c) => s + c._count, 0);

    return {
      summary: {
        totalAssets: liveRows.length,
        totalNetBookValue,
        pendingReviews,
      },
      counts: {
        all: totalAll,
        voided: dbCount(RECORD_UNDO_STATUS.VOIDED),
        reversed: dbCount(RECORD_UNDO_STATUS.REVERSED),
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
    const [assets, pendingReviews, current, ca] = await Promise.all([
      prisma.asset.findMany({
        where: { userId, status: { in: [...ASSET_ON_BOOKS_STATUSES] } },
      }),
      prisma.asset.count({
        where: {
          userId,
          assignToConsultant: true,
          consultantReviewStatus: { in: [...CONSULTANT_REVIEW_OPEN_STATUSES] },
          status: {
            notIn: [RECORD_UNDO_STATUS.VOIDED, RECORD_UNDO_STATUS.REVERSED],
          },
        },
      }),
      buildCurrentAssetsSnapshot(userId),
      capitalAllowanceService.getSchedule(userId, lagosYear()),
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
        capitalAllowance: ca.summary.totalAllowance,
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
    const normalizedStatus = opts?.status?.trim() || "all";
    const baseWhere = { userId };
    const liveWhere = {
      ...baseWhere,
      status: {
        notIn: [RECORD_UNDO_STATUS.VOIDED, RECORD_UNDO_STATUS.REVERSED],
      },
    };
    const listWhere = {
      ...baseWhere,
      status: buildAssetTransferListStatusFilter(normalizedStatus),
    };

    const [rows, total, liveCount, counts] = await Promise.all([
      prisma.assetTransfer.findMany({
        where: listWhere,
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
      prisma.assetTransfer.count({ where: listWhere }),
      prisma.assetTransfer.count({ where: liveWhere }),
      prisma.assetTransfer.groupBy({
        by: ["status"],
        where: baseWhere,
        _count: true,
      }),
    ]);

    const dbCount = (s: string) =>
      counts.find((c) => c.status === s)?._count ?? 0;

    const mapTransfer = (t: (typeof rows)[number]) => ({
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
      undo: mapUndoPayload(t),
    });

    return {
      summary: { totalTransfers: liveCount },
      counts: {
        all: liveCount,
        voided: dbCount(RECORD_UNDO_STATUS.VOIDED),
        reversed: dbCount(RECORD_UNDO_STATUS.REVERSED),
      },
      transfers: rows.map(mapTransfer),
      pagination: {
        page,
        limit,
        totalRecords: total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  },

  async getTransferById(userId: string, transferId: string) {
    const t = await prisma.assetTransfer.findFirst({
      where: { id: transferId, userId },
      include: {
        asset: {
          select: { assetCode: true, assetName: true, assetType: true },
        },
      },
    });
    if (!t) return null;
    return {
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
      undo: mapUndoPayload(t),
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
      await ledgerPostingService.postAssetSale(
        userId,
        row.id,
        {
          cost: d(asset.purchaseCost),
          accumulatedDepreciation: dep.accumulatedDepreciation,
          salePrice: data.salePrice,
          saleDate,
        },
        tx,
      );
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

    await syncSaleRecord(userId, {
      amount: data.salePrice,
      description: `Asset sale: ${asset.assetName}`,
      category: "Asset Sale",
      itemName: asset.assetName,
      customerName: data.buyer.trim(),
      saleDate,
      paymentType: "Cash",
      assetSaleId: sale.id,
      vatTag: "exempt",
      serviceIncome: false,
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
    opts?: { page?: number; limit?: number; status?: string },
  ) {
    const page = opts?.page ?? 1;
    const limit = Math.min(Math.max(1, opts?.limit ?? 20), 100);
    const normalizedStatus = opts?.status?.trim() || "all";
    const baseWhere = { userId };
    const liveWhere = {
      ...baseWhere,
      status: { notIn: [ASSET_EVENT_STATUS.REVERSED] },
    };
    const listWhere = {
      ...baseWhere,
      status: buildAssetEventListStatusFilter(normalizedStatus),
    };

    const [rows, total, liveCount, agg, counts] = await Promise.all([
      prisma.assetSale.findMany({
        where: listWhere,
        include: {
          asset: {
            select: { assetCode: true, assetName: true, assetType: true },
          },
        },
        orderBy: { saleDate: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.assetSale.count({ where: listWhere }),
      prisma.assetSale.count({ where: liveWhere }),
      prisma.assetSale.aggregate({
        where: liveWhere,
        _sum: { salePrice: true },
      }),
      prisma.assetSale.groupBy({
        by: ["status"],
        where: baseWhere,
        _count: true,
      }),
    ]);

    const dbCount = (s: string) =>
      counts.find((c) => c.status === s)?._count ?? 0;

    const mapSale = (s: (typeof rows)[number]) => ({
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
      status: s.status,
      undo: mapUndoPayload(s),
    });

    return {
      summary: {
        totalSales: liveCount,
        totalSaleValue: normalizeMoneyAmount(d(agg._sum.salePrice)),
      },
      counts: {
        all: liveCount,
        reversed: dbCount(ASSET_EVENT_STATUS.REVERSED),
      },
      sales: rows.map(mapSale),
      pagination: {
        page,
        limit,
        totalRecords: total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  },

  async getSaleById(userId: string, saleId: string) {
    const s = await prisma.assetSale.findFirst({
      where: { id: saleId, userId },
      include: {
        asset: {
          select: { assetCode: true, assetName: true, assetType: true },
        },
      },
    });
    if (!s) return null;
    return {
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
      status: s.status,
      undo: mapUndoPayload(s),
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
      await ledgerPostingService.postAssetDisposal(
        userId,
        row.id,
        {
          cost: d(asset.purchaseCost),
          accumulatedDepreciation: dep.accumulatedDepreciation,
          disposalDate,
        },
        tx,
      );
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
    opts?: { page?: number; limit?: number; status?: string },
  ) {
    const page = opts?.page ?? 1;
    const limit = Math.min(Math.max(1, opts?.limit ?? 20), 100);
    const normalizedStatus = opts?.status?.trim() || "all";
    const baseWhere = { userId };
    const liveWhere = {
      ...baseWhere,
      status: { notIn: [ASSET_EVENT_STATUS.REVERSED] },
    };
    const listWhere = {
      ...baseWhere,
      status: buildAssetEventListStatusFilter(normalizedStatus),
    };

    const [rows, total, liveCount, agg, counts] = await Promise.all([
      prisma.assetDisposal.findMany({
        where: listWhere,
        include: {
          asset: {
            select: { assetCode: true, assetName: true, assetType: true },
          },
        },
        orderBy: { disposalDate: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.assetDisposal.count({ where: listWhere }),
      prisma.assetDisposal.count({ where: liveWhere }),
      prisma.assetDisposal.aggregate({
        where: liveWhere,
        _sum: { bookValueAtDisposal: true },
      }),
      prisma.assetDisposal.groupBy({
        by: ["status"],
        where: baseWhere,
        _count: true,
      }),
    ]);

    const dbCount = (s: string) =>
      counts.find((c) => c.status === s)?._count ?? 0;

    const mapDisposal = (r: (typeof rows)[number]) => ({
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
      status: r.status,
      undo: mapUndoPayload(r),
    });

    return {
      summary: {
        totalDisposals: liveCount,
        totalBookValueAtDisposal: normalizeMoneyAmount(
          d(agg._sum.bookValueAtDisposal),
        ),
      },
      counts: {
        all: liveCount,
        reversed: dbCount(ASSET_EVENT_STATUS.REVERSED),
      },
      disposals: rows.map(mapDisposal),
      pagination: {
        page,
        limit,
        totalRecords: total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  },

  async getDisposalById(userId: string, disposalId: string) {
    const r = await prisma.assetDisposal.findFirst({
      where: { id: disposalId, userId },
      include: {
        asset: {
          select: { assetCode: true, assetName: true, assetType: true },
        },
      },
    });
    if (!r) return null;
    return {
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
      evidenceUrl: r.evidenceUrl,
      status: r.status,
      undo: mapUndoPayload(r),
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
