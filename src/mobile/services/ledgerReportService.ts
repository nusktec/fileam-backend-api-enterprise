import { prisma } from "../../config/database";
import {
  CHART_ACCOUNTS,
  CHART_BY_CODE,
  CHART_SECTION_ORDER,
  balanceToTrialSides,
  dashboardUsesClosingBalance,
  resolveChartAccountCode,
  type ChartAccount,
} from "../../constants/chartOfAccounts";
import {
  LEDGER_BOOKS_STATUSES,
  LEDGER_REFERENCE_TYPES,
} from "../../constants/ledger";
import { normalizeMoneyAmount } from "../../utils/monetaryAmount";
import {
  dashboardPlPeriod,
  type LedgerPeriod,
} from "../../utils/ledgerPeriodQuery";

type TxMeta = {
  id: string;
  description: string;
  transactionDate: Date;
  referenceType: string;
  referenceId: string | null;
  reversalOfId: string | null;
  status: string;
};

type RawEntry = {
  id: string;
  accountCode: string;
  debit: number;
  credit: number;
  transaction: TxMeta;
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
  [LEDGER_REFERENCE_TYPES.ASSET_SALE]: "asset",
  [LEDGER_REFERENCE_TYPES.ASSET_DISPOSAL]: "asset",
  [LEDGER_REFERENCE_TYPES.DEPRECIATION]: "asset",
  [LEDGER_REFERENCE_TYPES.TAX_PAID]: "tax",
  [LEDGER_REFERENCE_TYPES.SALARY_ACCRUED]: "payroll",
  [LEDGER_REFERENCE_TYPES.SALARY_PAID]: "payroll",
  [LEDGER_REFERENCE_TYPES.VAT_REMITTED]: "tax",
  [LEDGER_REFERENCE_TYPES.WHT_SUFFERED]: "tax",
  [LEDGER_REFERENCE_TYPES.CASH_OPENING]: "asset",
  [LEDGER_REFERENCE_TYPES.BANK_OPENING]: "asset",
  [LEDGER_REFERENCE_TYPES.RECEIVABLE]: "asset",
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
  return SOURCE_TYPE_MAP[referenceType] ?? "sale";
}

function isReversingJournal(tx: TxMeta): boolean {
  return (
    tx.referenceType === LEDGER_REFERENCE_TYPES.REVERSAL ||
    tx.reversalOfId != null
  );
}

async function fetchBookEntries(
  userId: string,
  opts?: { from?: Date; to?: Date },
): Promise<RawEntry[]> {
  const rows = await prisma.ledgerEntry.findMany({
    where: {
      transaction: {
        userId,
        status: { in: [...LEDGER_BOOKS_STATUSES] },
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

type ChartMovement = {
  chartCode: string;
  account: ChartAccount;
  netDebitMinusCredit: number;
  periodDebit: number;
  periodCredit: number;
};

function aggregateToChart(entries: RawEntry[]): Map<string, ChartMovement> {
  const map = new Map<string, ChartMovement>();
  for (const acct of CHART_ACCOUNTS) {
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

function combineMovements(
  closing: Map<string, ChartMovement>,
  period: Map<string, ChartMovement>,
  useClosing: (account: ChartAccount) => boolean,
): Map<string, ChartMovement> {
  const combined = new Map<string, ChartMovement>();
  for (const acct of CHART_ACCOUNTS) {
    const close = closing.get(acct.code)!;
    const move = period.get(acct.code)!;
    combined.set(acct.code, {
      chartCode: acct.code,
      account: acct,
      netDebitMinusCredit: useClosing(acct)
        ? close.netDebitMinusCredit
        : move.netDebitMinusCredit,
      periodDebit: move.periodDebit,
      periodCredit: move.periodCredit,
    });
  }
  return combined;
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

    const debit = normalizeMoneyAmount(lines.reduce((s, l) => s + l.debit, 0));
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

async function originalSourceMap(
  userId: string,
  entries: RawEntry[],
): Promise<Map<string, { referenceType: string; referenceId: string | null }>> {
  const ids = [
    ...new Set(
      entries
        .map((e) => e.transaction.reversalOfId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (ids.length === 0) return new Map();
  const originals = await prisma.ledgerTransaction.findMany({
    where: { userId, id: { in: ids } },
    select: { id: true, referenceType: true, referenceId: true },
  });
  return new Map(
    originals.map((o) => [
      o.id,
      { referenceType: o.referenceType, referenceId: o.referenceId },
    ]),
  );
}

export const ledgerReportService = {
  async getDashboard(userId: string) {
    const plWindow = dashboardPlPeriod();
    const [asAtEntries, ytdEntries] = await Promise.all([
      fetchBookEntries(userId, { to: plWindow.end }),
      fetchBookEntries(userId, { from: plWindow.start, to: plWindow.end }),
    ]);

    const combined = combineMovements(
      aggregateToChart(asAtEntries),
      aggregateToChart(ytdEntries),
      dashboardUsesClosingBalance,
    );
    const { sections, totals } = buildTrialBalanceSections(combined);
    return {
      asAt: plWindow.asAt,
      totals,
      sections: sections.map(({ lines: _lines, ...rest }) => rest),
    };
  },

  async getTrialBalance(userId: string, period: LedgerPeriod) {
    const [bsClosingEntries, plPeriodEntries] = await Promise.all([
      fetchBookEntries(userId, { to: period.end }),
      fetchBookEntries(userId, { from: period.start, to: period.end }),
    ]);

    const combined = combineMovements(
      aggregateToChart(bsClosingEntries),
      aggregateToChart(plPeriodEntries),
      (account) => account.reportClass === "balance_sheet",
    );
    const { sections, totals } = buildTrialBalanceSections(combined);
    return {
      period: periodPayload(period),
      totals,
      sections,
    };
  },

  async getGeneralLedger(userId: string, period: LedgerPeriod) {
    const beforeStart = dayBefore(period.start);
    const [openingEntries, periodEntries] = await Promise.all([
      fetchBookEntries(userId, { to: beforeStart }),
      fetchBookEntries(userId, { from: period.start, to: period.end }),
    ]);

    const openingMap = aggregateToChart(openingEntries);
    const originals = await originalSourceMap(userId, periodEntries);

    const entriesByChart = new Map<string, RawEntry[]>();
    for (const entry of periodEntries) {
      const chartCode = resolveChartAccountCode(entry.accountCode);
      if (!chartCode || !CHART_BY_CODE.has(chartCode)) continue;
      const list = entriesByChart.get(chartCode) ?? [];
      list.push(entry);
      entriesByChart.set(chartCode, list);
    }

    const accounts = CHART_ACCOUNTS.filter((account) => {
      const opening = openingMap.get(account.code)!;
      const listed = entriesByChart.get(account.code) ?? [];
      const periodDebit = listed.reduce((s, e) => s + e.debit, 0);
      const periodCredit = listed.reduce((s, e) => s + e.credit, 0);
      const openingNet =
        account.reportClass === "profit_and_loss"
          ? 0
          : opening.netDebitMinusCredit;
      return (
        openingNet !== 0 ||
        periodDebit > 0 ||
        periodCredit > 0 ||
        listed.length > 0
      );
    })
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((account) => {
        const listed = (entriesByChart.get(account.code) ?? []).slice().sort(
          (a, b) => {
            const dt =
              a.transaction.transactionDate.getTime() -
              b.transaction.transactionDate.getTime();
            if (dt !== 0) return dt;
            return a.id.localeCompare(b.id);
          },
        );
        const periodDebit = normalizeMoneyAmount(
          listed.reduce((s, e) => s + e.debit, 0),
        );
        const periodCredit = normalizeMoneyAmount(
          listed.reduce((s, e) => s + e.credit, 0),
        );
        const openingNet =
          account.reportClass === "profit_and_loss"
            ? 0
            : openingMap.get(account.code)!.netDebitMinusCredit;
        const closingNet = openingNet + periodDebit - periodCredit;
        const openingSides = balanceToTrialSides(account, openingNet);
        const closingSides = balanceToTrialSides(account, closingNet);

        const entries = listed.map((e) => {
          const reversing = isReversingJournal(e.transaction);
          const origin = e.transaction.reversalOfId
            ? originals.get(e.transaction.reversalOfId)
            : undefined;
          const sourceType = resolveSourceType(
            reversing && origin
              ? origin.referenceType
              : e.transaction.referenceType,
          );
          return {
            id: e.id,
            date: formatYmd(e.transaction.transactionDate),
            description: e.transaction.description,
            source: SOURCE_LABEL[sourceType] ?? "Sale",
            sourceType,
            sourceId: reversing
              ? (origin?.referenceId ?? e.transaction.referenceId)
              : e.transaction.referenceId,
            isReversal: reversing,
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
