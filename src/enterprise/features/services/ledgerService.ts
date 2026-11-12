import { prisma } from "../../../config/database";
import {
  CHART_ACCOUNTS,
  CHART_BY_CODE,
  resolveChartAccountCode,
  type ChartAccount,
} from "../../../constants/chartOfAccounts";
import { LEDGER_BOOKS_STATUSES } from "../../../constants/ledger";
import { normalizeMoneyAmount } from "../../../utils/monetaryAmount";
import { PIPELINE_STAGES, RECORD_TYPES } from "../constants";
import {
  decimalToNumber,
  formatHHmm,
  formatYmd,
  parsePositiveInt,
  periodBounds,
} from "../utils";

type GroupName = "Assets" | "Liabilities" | "Income" | "Expenses";

function groupForAccount(account: ChartAccount): {
  name: GroupName;
  normal: "debit" | "credit";
} {
  if (account.lineType === "asset" || account.lineType === "contra_asset") {
    return {
      name: "Assets",
      normal: account.normalDebit ? "debit" : "credit",
    };
  }
  if (account.lineType === "liability") {
    return { name: "Liabilities", normal: "credit" };
  }
  if (account.lineType === "income") {
    return { name: "Income", normal: "credit" };
  }
  return { name: "Expenses", normal: "debit" };
}

function sourceLabel(referenceType: string | null): string {
  if (!referenceType) return "General ledger";
  const t = referenceType.toLowerCase();
  if (t.includes("sale") || t.includes("payer")) return "Sales";
  if (t.includes("expense") || t.includes("beneficiary")) return "Expenses";
  if (t.includes("bank") || t.includes("cash")) return "Bank reconciliation";
  if (t.includes("payroll") || t.includes("salary")) return "Payroll";
  if (t.includes("asset") || t.includes("depreciation")) return "Assets";
  if (t.includes("inventory")) return "Inventory";
  if (t.includes("tax") || t.includes("vat") || t.includes("wht")) return "Tax";
  return "General ledger";
}

async function finalizedReferenceIds(clientUserId: string): Promise<{
  saleIds: Set<string>;
  expenseIds: Set<string>;
}> {
  const rows = await prisma.enterprisePipelineStage.findMany({
    where: {
      clientUserId,
      pipelineStage: PIPELINE_STAGES.FINALIZED,
    },
    select: { recordType: true, recordId: true },
  });
  const saleIds = new Set<string>();
  const expenseIds = new Set<string>();
  for (const r of rows) {
    if (r.recordType === RECORD_TYPES.SALE) saleIds.add(r.recordId);
    if (r.recordType === RECORD_TYPES.EXPENSE) expenseIds.add(r.recordId);
  }
  return { saleIds, expenseIds };
}

function isFinalizedEntry(
  referenceType: string,
  referenceId: string | null,
  finalized: { saleIds: Set<string>; expenseIds: Set<string> },
): boolean {
  if (!referenceId) return true;
  const t = referenceType.toUpperCase();
  if (t.includes("SALE") || t.includes("PAYER")) {
    return finalized.saleIds.has(referenceId);
  }
  if (t.includes("EXPENSE") || t.includes("BENEFICIARY")) {
    return finalized.expenseIds.has(referenceId);
  }
  return true;
}

export const featuresLedgerService = {
  async getLedger(clientUserId: string, year: number, month: number) {
    const bounds = periodBounds(year, month);
    const finalized = await finalizedReferenceIds(clientUserId);

    const [openingRows, periodRows, salesMissingEvidence, expensesMissingEvidence] =
      await Promise.all([
        prisma.ledgerEntry.findMany({
          where: {
            transaction: {
              userId: clientUserId,
              status: { in: [...LEDGER_BOOKS_STATUSES] },
              transactionDate: { lt: bounds.start },
            },
          },
          include: {
            transaction: {
              select: {
                referenceType: true,
                referenceId: true,
              },
            },
          },
        }),
        prisma.ledgerEntry.findMany({
          where: {
            transaction: {
              userId: clientUserId,
              status: { in: [...LEDGER_BOOKS_STATUSES] },
              transactionDate: { gte: bounds.start, lte: bounds.end },
            },
          },
          include: {
            transaction: {
              select: {
                referenceType: true,
                referenceId: true,
              },
            },
          },
        }),
        prisma.sale.count({
          where: {
            userId: clientUserId,
            undoAt: null,
            evidenceVaultId: null,
            saleDate: { gte: bounds.start, lte: bounds.end },
          },
        }),
        prisma.expense.count({
          where: {
            userId: clientUserId,
            undoAt: null,
            receiptUrl: null,
            expenseDate: { gte: bounds.start, lte: bounds.end },
          },
        }),
      ]);

    const openingByCode = new Map<string, number>();
    for (const row of openingRows) {
      if (
        !isFinalizedEntry(
          row.transaction.referenceType,
          row.transaction.referenceId,
          finalized,
        )
      ) {
        continue;
      }
      const code = resolveChartAccountCode(row.accountCode);
      if (!code) continue;
      const net =
        (openingByCode.get(code) ?? 0) +
        decimalToNumber(row.debit) -
        decimalToNumber(row.credit);
      openingByCode.set(code, normalizeMoneyAmount(net));
    }

    const periodByCode = new Map<
      string,
      { debits: number; credits: number; source: string }
    >();
    for (const row of periodRows) {
      if (
        !isFinalizedEntry(
          row.transaction.referenceType,
          row.transaction.referenceId,
          finalized,
        )
      ) {
        continue;
      }
      const code = resolveChartAccountCode(row.accountCode);
      if (!code) continue;
      const cur = periodByCode.get(code) ?? {
        debits: 0,
        credits: 0,
        source: sourceLabel(row.transaction.referenceType),
      };
      cur.debits = normalizeMoneyAmount(
        cur.debits + decimalToNumber(row.debit),
      );
      cur.credits = normalizeMoneyAmount(
        cur.credits + decimalToNumber(row.credit),
      );
      periodByCode.set(code, cur);
    }

    const groupOrder: GroupName[] = [
      "Assets",
      "Liabilities",
      "Income",
      "Expenses",
    ];
    const groups = groupOrder.map((name) => {
      const sample = CHART_ACCOUNTS.find((a) => groupForAccount(a).name === name)!;
      const normal = groupForAccount(sample).normal;
      const accounts = CHART_ACCOUNTS.filter(
        (a) => groupForAccount(a).name === name,
      )
        .map((account) => {
          const opening = normalizeMoneyAmount(openingByCode.get(account.code) ?? 0);
          const period = periodByCode.get(account.code);
          const debits = period?.debits ?? 0;
          const credits = period?.credits ?? 0;
          if (opening === 0 && debits === 0 && credits === 0) return null;
          return {
            code: account.code,
            name: account.name,
            source: period?.source ?? "General ledger",
            opening,
            debits,
            credits,
          };
        })
        .filter((a): a is NonNullable<typeof a> => a != null);

      return { name, normal, accounts };
    });

    const evidenceGaps = salesMissingEvidence + expensesMissingEvidence;
    const checkedAt = new Date();
    await prisma.enterpriseLedgerIntegrityCheck.upsert({
      where: {
        clientUserId_year_month: { clientUserId, year, month },
      },
      create: {
        clientUserId,
        year,
        month,
        checkedAt,
        evidenceGaps,
      },
      update: { checkedAt, evidenceGaps },
    });

    return {
      period: bounds.period,
      periodStart: bounds.periodStart,
      periodEnd: bounds.periodEnd,
      integrityCheckedAt: formatHHmm(checkedAt),
      evidenceGaps,
      groups,
    };
  },

  async getAccountEntries(
    clientUserId: string,
    code: string,
    year: number,
    month: number,
    pageRaw?: unknown,
    limitRaw?: unknown,
  ) {
    const account = CHART_BY_CODE.get(code) ?? CHART_ACCOUNTS.find((a) => a.code === code);
    if (!account) {
      return null;
    }

    const bounds = periodBounds(year, month);
    const page = parsePositiveInt(pageRaw, 1);
    const limit = parsePositiveInt(limitRaw, 50);
    const finalized = await finalizedReferenceIds(clientUserId);

    const rows = await prisma.ledgerEntry.findMany({
      where: {
        transaction: {
          userId: clientUserId,
          status: { in: [...LEDGER_BOOKS_STATUSES] },
          transactionDate: { gte: bounds.start, lte: bounds.end },
        },
      },
      include: {
        transaction: {
          select: {
            id: true,
            description: true,
            transactionDate: true,
            referenceType: true,
            referenceId: true,
          },
        },
      },
      orderBy: { transaction: { transactionDate: "asc" } },
    });

    const filtered = rows.filter(
      (r) =>
        resolveChartAccountCode(r.accountCode) === code &&
        isFinalizedEntry(
          r.transaction.referenceType,
          r.transaction.referenceId,
          finalized,
        ),
    );

    const total = filtered.length;
    const slice = filtered.slice((page - 1) * limit, page * limit);
    const entries = slice.map((r) => ({
      id: r.id,
      date: formatYmd(r.transaction.transactionDate),
      description: r.transaction.description,
      reference: r.transaction.referenceId ?? r.transaction.id,
      debit: decimalToNumber(r.debit),
      credit: decimalToNumber(r.credit),
      source: sourceLabel(r.transaction.referenceType),
    }));

    return {
      accountCode: account.code,
      accountName: account.name,
      entries,
      pagination: { total, page, limit },
    };
  },
};
