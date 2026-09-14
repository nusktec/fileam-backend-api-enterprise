import { prisma } from "../../config/database";
import {
  CHART_ACCOUNTS,
  CHART_BY_CODE,
  CHART_SECTION_ORDER,
  balanceToTrialSides,
  resolveChartAccountCode,
  type ChartAccount,
} from "../../constants/chartOfAccounts";
import {
  LEDGER_REFERENCE_TYPES,
  LEDGER_STATUS,
} from "../../constants/ledger";
import { normalizeMoneyAmount } from "../../utils/monetaryAmount";
import {
  dashboardPlPeriod,
  type LedgerPeriod,
} from "../../utils/ledgerPeriodQuery";

type RawEntry = {
  id: string;
  accountCode: string;
  debit: number;
  credit: number;
  transaction: {
    id: string;
    description: string;
    transactionDate: Date;
    referenceType: string;
    referenceId: string | null;
    reversalOfId: string | null;
    status: string;
  };
};

function decimal(n: unknown): number {
  return normalizeMoneyAmount(Number(n ?? 0));
}

function formatYmd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dayBefore(date: Date): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

const SOURCE_TYPE_MAP: Record<string, string> = {
  [LEDGER_REFERENCE_TYPES.SALE_RECOGNITION]: "sale",
  [LEDGER_REFERENCE_TYPES.SALE_COLLECTION]: "sale",
  [LEDGER_REFERENCE_TYPES.EXPENSE_RECOGNITION]: "expense",
  [LEDGER_REFERENCE_TYPES.EXPENSE_PAYMENT]: "expense",
  [LEDGER_REFERENCE_TYPES.PAYER_RECOGNITION]: "payer",
  [LEDGER_REFERENCE_TYPES.PAYER_COLLECTION]: "payer",
  [LEDGER_REFERENCE_TYPES.BENEFICIARY_INVOICE]: "beneficiary",
  [LEDGER_REFERENCE_TYPES.BENEFICIARY_PAYMENT]: "beneficiary",
  [LEDGER_REFERENCE_TYPES.WHT_REMITTED]: "beneficiary",
  [LEDGER_REFERENCE_TYPES.LOAN_RECEIVED]: "liability",
  [LEDGER_REFERENCE_TYPES.LOAN_PRINCIPAL_PAID]: "liability",
  [LEDGER_REFERENCE_TYPES.LOAN_INTEREST_PAID]: "liability",
  [LEDGER_REFERENCE_TYPES.ASSET_PURCHASE]: "asset",
  [LEDGER_REFERENCE_TYPES.DEPRECIATION]: "asset",
  [LEDGER_REFERENCE_TYPES.TAX_PAID]: "tax",
  [LEDGER_REFERENCE_TYPES.SALARY_ACCRUED]: "payroll",
  [LEDGER_REFERENCE_TYPES.SALARY_PAID]: "payroll",
  [LEDGER_REFERENCE_TYPES.VAT_REMITTED]: "tax",
  [LEDGER_REFERENCE_TYPES.CASH_OPENING]: "asset",
  [LEDGER_REFERENCE_TYPES.BANK_OPENING]: "asset",
  [LEDGER_REFERENCE_TYPES.RECEIVABLE]: "asset",
  [LEDGER_REFERENCE_TYPES.REVERSAL]: "sale",
};

const SOURCE_LABEL: Record<string, string> = {
  sale: "Sale",
  expense: "Expense",
  inventory: "Inventory",
  prepayment: "Prepayment",
  payroll: "Payroll",
  asset: "Asset",
  liability: "Liability",
  payer: "Payer",
  beneficiary: "Beneficiary",
  tax: "Tax",
};

function resolveSourceType(referenceType: string): string {
  if (referenceType === LEDGER_REFERENCE_TYPES.REVERSAL) return "sale";
  return SOURCE_TYPE_MAP[referenceType] ?? "sale";
}

async function fetchNetPostedEntries(
  userId: string,
  opts?: { from?: Date; to?: Date },
): Promise<RawEntry[]> {
  const rows = await prisma.ledgerEntry.findMany({
    where: {
      transaction: {
        userId,
        status: LEDGER_STATUS.POSTED,
        ...(opts?.from || opts?.to
          ? {
              transactionDate: {
                ...(opts.from ? { gte: opts.from } : {}),
                ...(opts.to ? { lte: opts.to } : {}),
              },
            }
          : {}),
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
          reversalOfId: true,
          status: true,
        },
      },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    accountCode: r.accountCode,
    debit: decimal(r.debit),
    credit: decimal(r.credit),
    transaction: r.transaction,
  }));
}

async function fetchGeneralLedgerEntries(
  userId: string,
  from: Date,
  to: Date,
): Promise<RawEntry[]> {
  const rows = await prisma.ledgerEntry.findMany({
    where: {
      transaction: {
        userId,
        status: { in: [LEDGER_STATUS.POSTED, LEDGER_STATUS.REVERSED] },
        transactionDate: { gte: from, lte: to },
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
          reversalOfId: true,
          status: true,
        },
      },
    },
    orderBy: [{ transaction: { transactionDate: "asc" } }, { id: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    accountCode: r.accountCode,
    debit: decimal(r.debit),
    credit: decimal(r.credit),
    transaction: r.transaction,
  }));
}

type ChartMovement = {
  chartCode: string;
  account: ChartAccount;
  netDebitMinusCredit: number;
  periodDebit: number;
  periodCredit: number;
};

function aggregateToChart(
  entries: RawEntry[],
  accounts: ChartAccount[],
): Map<string, ChartMovement> {
  const map = new Map<string, ChartMovement>();
  for (const acct of accounts) {
    map.set(acct.code, {
      chartCode: acct.code,
      account: acct,
      netDebitMinusCredit: 0,
      periodDebit: 0,
      periodCredit: 0,
    });
  }

  for (const entry of entries) {
    const chartCode = resolveChartAccountCode(entry.accountCode);
    if (!chartCode || !map.has(chartCode)) continue;
    const row = map.get(chartCode)!;
    row.netDebitMinusCredit = normalizeMoneyAmount(
      row.netDebitMinusCredit + entry.debit - entry.credit,
    );
    row.periodDebit = normalizeMoneyAmount(row.periodDebit + entry.debit);
    row.periodCredit = normalizeMoneyAmount(row.periodCredit + entry.credit);
  }

  return map;
}

function buildTrialBalanceSections(movements: Map<string, ChartMovement>) {
  const sections = CHART_SECTION_ORDER.map((section) => {
    const lines = CHART_ACCOUNTS.filter((a) => a.sectionType === section.type)
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((account) => {
        const mv = movements.get(account.code)!;
        const sides = balanceToTrialSides(account, mv.netDebitMinusCredit);
        return {
          code: account.code,
          name: account.name,
          type: account.lineType,
          debit: sides.debit,
          credit: sides.credit,
        };
      });

    const debit = normalizeMoneyAmount(
      lines.reduce((s, l) => s + l.debit, 0),
    );
    const credit = normalizeMoneyAmount(
      lines.reduce((s, l) => s + l.credit, 0),
    );

    return {
      type: section.type,
      label: section.label,
      debit,
      credit,
      lines,
    };
  });

  const totals = {
    debit: normalizeMoneyAmount(sections.reduce((s, x) => s + x.debit, 0)),
    credit: normalizeMoneyAmount(sections.reduce((s, x) => s + x.credit, 0)),
  };

  return { sections, totals };
}

function periodPayload(period: LedgerPeriod) {
  return {
    type: period.type,
    year: period.year,
    month: period.month,
    startDate: period.startDate,
    endDate: period.endDate,
  };
}

export const ledgerReportService = {
  async getDashboard(userId: string) {
    const plWindow = dashboardPlPeriod();
    const bsEntries = await fetchNetPostedEntries(userId, {
      to: plWindow.end,
    });
    const plEntries = await fetchNetPostedEntries(userId, {
      from: plWindow.start,
      to: plWindow.end,
    });

    const bsMovements = aggregateToChart(bsEntries, CHART_ACCOUNTS);
    const plMovements = aggregateToChart(plEntries, CHART_ACCOUNTS);

    const combined = new Map<string, ChartMovement>();
    for (const acct of CHART_ACCOUNTS) {
      const bs = bsMovements.get(acct.code)!;
      const pl = plMovements.get(acct.code)!;
      combined.set(acct.code, {
        chartCode: acct.code,
        account: acct,
        netDebitMinusCredit:
          acct.reportClass === "balance_sheet"
            ? bs.netDebitMinusCredit
            : pl.netDebitMinusCredit,
        periodDebit: pl.periodDebit,
        periodCredit: pl.periodCredit,
      });
    }

    const { sections, totals } = buildTrialBalanceSections(combined);
    return {
      asAt: plWindow.asAt,
      totals,
      sections: sections.map(({ lines: _lines, ...rest }) => rest),
    };
  },

  async getTrialBalance(userId: string, period: LedgerPeriod) {
    const beforeStart = dayBefore(period.start);

    const [bsClosingEntries, plPeriodEntries] = await Promise.all([
      fetchNetPostedEntries(userId, { to: period.end }),
      fetchNetPostedEntries(userId, { from: period.start, to: period.end }),
    ]);

    const bsMovements = aggregateToChart(bsClosingEntries, CHART_ACCOUNTS);
    const plMovements = aggregateToChart(plPeriodEntries, CHART_ACCOUNTS);

    const combined = new Map<string, ChartMovement>();
    for (const acct of CHART_ACCOUNTS) {
      const bs = bsMovements.get(acct.code)!;
      const pl = plMovements.get(acct.code)!;
      combined.set(acct.code, {
        chartCode: acct.code,
        account: acct,
        netDebitMinusCredit:
          acct.reportClass === "balance_sheet"
            ? bs.netDebitMinusCredit
            : pl.netDebitMinusCredit,
        periodDebit: pl.periodDebit,
        periodCredit: pl.periodCredit,
      });
    }

    void beforeStart;
    const { sections, totals } = buildTrialBalanceSections(combined);
    return {
      period: periodPayload(period),
      totals,
      sections,
    };
  },

  async getGeneralLedger(userId: string, period: LedgerPeriod) {
    const beforeStart = dayBefore(period.start);
    const [openingEntries, periodEntries, glEntries] = await Promise.all([
      fetchNetPostedEntries(userId, { to: beforeStart }),
      fetchNetPostedEntries(userId, { from: period.start, to: period.end }),
      fetchGeneralLedgerEntries(userId, period.start, period.end),
    ]);

    const openingMap = aggregateToChart(openingEntries, CHART_ACCOUNTS);
    const periodMap = aggregateToChart(periodEntries, CHART_ACCOUNTS);

    const entriesByChart = new Map<string, RawEntry[]>();
    for (const entry of glEntries) {
      const chartCode = resolveChartAccountCode(entry.accountCode);
      if (!chartCode || !CHART_BY_CODE.has(chartCode)) continue;
      const list = entriesByChart.get(chartCode) ?? [];
      list.push(entry);
      entriesByChart.set(chartCode, list);
    }

    const accounts = CHART_ACCOUNTS.filter((account) => {
      const opening = openingMap.get(account.code)!;
      const movement = periodMap.get(account.code)!;
      const hasEntries = (entriesByChart.get(account.code)?.length ?? 0) > 0;
      if (account.reportClass === "profit_and_loss") {
        return (
          movement.periodDebit > 0 ||
          movement.periodCredit > 0 ||
          hasEntries
        );
      }
      return (
        opening.netDebitMinusCredit !== 0 ||
        movement.periodDebit > 0 ||
        movement.periodCredit > 0 ||
        hasEntries
      );
    })
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((account) => {
        const openingNet =
          account.reportClass === "profit_and_loss"
            ? 0
            : openingMap.get(account.code)!.netDebitMinusCredit;
        const periodDebit = periodMap.get(account.code)!.periodDebit;
        const periodCredit = periodMap.get(account.code)!.periodCredit;
        const closingNet =
          account.reportClass === "profit_and_loss"
            ? periodDebit - periodCredit
            : openingNet + periodDebit - periodCredit;

        const openingSides = balanceToTrialSides(account, openingNet);
        const closingSides = balanceToTrialSides(account, closingNet);

        const entries = (entriesByChart.get(account.code) ?? []).map((e) => {
          const isReversal =
            e.transaction.referenceType === LEDGER_REFERENCE_TYPES.REVERSAL ||
            e.transaction.reversalOfId != null;
          const sourceType = isReversal
            ? resolveSourceType(
                e.transaction.referenceType === LEDGER_REFERENCE_TYPES.REVERSAL
                  ? LEDGER_REFERENCE_TYPES.REVERSAL
                  : e.transaction.referenceType,
              )
            : resolveSourceType(e.transaction.referenceType);
          return {
            id: e.id,
            date: formatYmd(e.transaction.transactionDate),
            description: e.transaction.description,
            source: SOURCE_LABEL[sourceType] ?? "Sale",
            sourceType,
            sourceId: e.transaction.referenceId,
            isReversal,
            debit: e.debit,
            credit: e.credit,
          };
        });

        return {
          code: account.code,
          name: account.name,
          type: account.lineType,
          openingDebit: openingSides.debit,
          openingCredit: openingSides.credit,
          periodDebit,
          periodCredit,
          closingDebit: closingSides.debit,
          closingCredit: closingSides.credit,
          entries,
        };
      });

    return {
      period: periodPayload(period),
      accounts,
    };
  },
};
