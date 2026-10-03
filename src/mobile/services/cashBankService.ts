import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import {
  BANK_ACCOUNT_TYPE_LABELS,
  CASH_TYPE_LABELS,
  type CashType,
  type OpeningBalanceSource,
} from "../../constants/cashBank";
import {
  LEDGER_ACCOUNTS,
  LEDGER_REFERENCE_TYPES,
  type LedgerEntryDraft,
} from "../../constants/ledger";
import { ledgerService } from "../../services/ledgerService";
import { nextDisplayCode } from "../../utils/codeGenerator";
import { HttpReplyError } from "../../utils/httpReplyError";
import { normalizeMoneyAmount } from "../../utils/monetaryAmount";

const CASH_COUNTER = "cash_balance_code";
const BANK_COUNTER = "bank_account_code";

function d(v: Decimal | number | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === "object" && typeof v.toNumber === "function") {
    return v.toNumber();
  }
  return Number(v);
}

function parseDateOnly(value: string, field = "date"): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) throw new HttpReplyError(400, `${field} must be YYYY-MM-DD`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function formatYmd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function cashAccountCode(cashType: CashType): string {
  switch (cashType) {
    case "cash_on_hand":
      return LEDGER_ACCOUNTS.CASH_ON_HAND;
    case "petty_cash":
      return LEDGER_ACCOUNTS.PETTY_CASH;
    case "other_cash":
      return LEDGER_ACCOUNTS.OTHER_CASH;
    default:
      return LEDGER_ACCOUNTS.CASH_ON_HAND;
  }
}

function creditAccountForSource(
  source: OpeningBalanceSource | null | undefined,
): { code: string; name: string } {
  switch (source ?? "owner_capital_introduced") {
    case "owner_capital_introduced":
    case "existing_business_funds":
    case "other":
    default:
      return {
        code: LEDGER_ACCOUNTS.OPENING_BALANCE,
        name: "Opening Balance",
      };
    case "loan_proceeds":
      return {
        code: LEDGER_ACCOUNTS.LOAN_LIABILITY,
        name: "Loan Liability",
      };
    case "transfer_from_another_business_account":
      return {
        code: LEDGER_ACCOUNTS.TRANSFER_CLEARING,
        name: "Transfer Clearing",
      };
  }
}

function openingBalanceEntries(
  debitAccount: { code: string; name: string },
  source: OpeningBalanceSource | null | undefined,
  amount: number,
): LedgerEntryDraft[] {
  const credit = creditAccountForSource(source);
  return [
    { accountCode: debitAccount.code, accountName: debitAccount.name, debit: amount, credit: 0 },
    { accountCode: credit.code, accountName: credit.name, debit: 0, credit: amount },
  ];
}

export const cashBankService = {
  async createCash(
    userId: string,
    input: { cashType: CashType; amount: number; note?: string },
  ) {
    const amount = normalizeMoneyAmount(input.amount);
    if (amount <= 0) {
      throw new HttpReplyError(400, "amount must be greater than 0");
    }

    const cashCode = await nextDisplayCode(CASH_COUNTER, "CASH");

    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.cashBalance.create({
        data: {
          userId,
          cashCode,
          cashType: input.cashType,
          amount: new Decimal(amount),
          note: input.note?.trim() || null,
        },
      });

      await ledgerService.post(
        {
          userId,
          referenceType: LEDGER_REFERENCE_TYPES.CASH_OPENING,
          referenceId: created.id,
          description: `Opening cash ${cashCode}`,
          transactionDate: new Date(),
          entries: [
            {
              accountCode: cashAccountCode(input.cashType),
              accountName: CASH_TYPE_LABELS[input.cashType],
              debit: amount,
              credit: 0,
            },
            {
              accountCode: LEDGER_ACCOUNTS.OPENING_BALANCE,
              accountName: "Opening Balance",
              debit: 0,
              credit: amount,
            },
          ],
        },
        tx,
      );

      return created;
    });

    return {
      id: row.id,
      cashCode: row.cashCode,
      cashType: row.cashType,
      amount: d(row.amount),
      note: row.note,
    };
  },

  async createBankAccount(
    userId: string,
    input: {
      bankName: string;
      accountName: string;
      accountNumber: string;
      accountType: string;
      accountPurpose: string;
      sourceOfOpeningBalance?: OpeningBalanceSource;
      openingBalance: number;
      balanceDate: string;
    },
  ) {
    const openingBalance = normalizeMoneyAmount(input.openingBalance);
    if (openingBalance <= 0) {
      throw new HttpReplyError(400, "openingBalance must be greater than 0");
    }

    const bankCode = await nextDisplayCode(BANK_COUNTER, "BANK");
    const balanceDate = parseDateOnly(input.balanceDate, "balanceDate");
    const bankAccountLedger = {
      code: `${LEDGER_ACCOUNTS.BANK}:${bankCode}`,
      name: `${input.bankName.trim()} — ${input.accountName.trim()}`,
    };

    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.bankAccount.create({
        data: {
          userId,
          bankCode,
          bankName: input.bankName.trim(),
          accountName: input.accountName.trim(),
          accountNumber: String(input.accountNumber).trim(),
          accountType: input.accountType,
          accountPurpose: input.accountPurpose,
          sourceOfOpeningBalance: input.sourceOfOpeningBalance ?? null,
          openingBalance: new Decimal(openingBalance),
          balanceDate,
        },
      });

      const openingSource = input.sourceOfOpeningBalance ?? "owner_capital_introduced";
      if (openingSource !== "transfer_from_another_business_account") {
        await ledgerService.post(
          {
            userId,
            referenceType: LEDGER_REFERENCE_TYPES.BANK_OPENING,
            referenceId: created.id,
            description: `Opening bank balance ${bankCode}`,
            transactionDate: balanceDate,
            entries: openingBalanceEntries(
              bankAccountLedger,
              openingSource,
              openingBalance,
            ),
          },
          tx,
        );
      }

      return created;
    });

    return {
      id: row.id,
      bankCode: row.bankCode,
      bankName: row.bankName,
      accountName: row.accountName,
      accountNumber: row.accountNumber,
      accountType: row.accountType,
      accountPurpose: row.accountPurpose,
      sourceOfOpeningBalance: row.sourceOfOpeningBalance,
      openingBalance: d(row.openingBalance),
      balanceDate: formatYmd(row.balanceDate),
    };
  },

  async listUserCash(userId: string) {
    return prisma.cashBalance.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
  },

  async listUserBanks(userId: string) {
    return prisma.bankAccount.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
  },
};

export { BANK_ACCOUNT_TYPE_LABELS, CASH_TYPE_LABELS };
