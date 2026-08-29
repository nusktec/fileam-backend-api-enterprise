import type { Prisma } from "@prisma/client";
import { prisma } from "../config/database";
import { LEDGER_ACCOUNTS, LEDGER_ACCOUNT_NAMES } from "../constants/ledger";
import { HttpReplyError } from "./httpReplyError";

type DbClient = Prisma.TransactionClient | typeof prisma;

export function bankLedgerCode(bankCode: string): string {
  return `${LEDGER_ACCOUNTS.BANK}:${bankCode.trim()}`;
}

export function bankLedgerAccount(bankCode: string, accountName: string) {
  return {
    code: bankLedgerCode(bankCode),
    name: accountName.trim(),
  };
}

/** Aggregate bank ledger when no specific account is selected. */
export function defaultBankLedgerAccount(): { code: string; name: string } {
  return {
    code: LEDGER_ACCOUNTS.BANK,
    name: LEDGER_ACCOUNT_NAMES[LEDGER_ACCOUNTS.BANK] ?? "Bank",
  };
}

/** Resolve a user-owned bank account to its ledger account (BANK:{bankCode}). */
export async function resolveUserBankLedgerAccount(
  userId: string,
  bankCode: string,
  db: DbClient = prisma,
): Promise<{ code: string; name: string }> {
  const code = bankCode?.trim();
  if (!code) {
    throw new HttpReplyError(
      400,
      "bankCode cannot be empty when provided",
      null,
      "VALIDATION_ERROR",
    );
  }

  const row = await db.bankAccount.findFirst({
    where: { userId, bankCode: code },
    select: { bankCode: true, bankName: true, accountName: true },
  });
  if (!row) {
    throw new HttpReplyError(
      400,
      "bankCode must reference one of your registered business bank accounts",
      null,
      "VALIDATION_ERROR",
    );
  }

  return bankLedgerAccount(
    row.bankCode,
    `${row.bankName} — ${row.accountName}`,
  );
}

/**
 * Transfer / bank settlement: BANK:{bankCode} when bankCode is set, else aggregate BANK.
 */
export async function resolveBankLedgerAccount(
  userId: string,
  bankCode: string | null | undefined,
  db: DbClient = prisma,
): Promise<{ code: string; name: string }> {
  const code = bankCode?.trim();
  if (!code) {
    return defaultBankLedgerAccount();
  }
  return resolveUserBankLedgerAccount(userId, code, db);
}

/** Card settlement: mapped business bank when bankCode provided, else CARD_SETTLEMENT. */
export async function resolveCardSettlementLedgerAccount(
  userId: string,
  bankCode: string | null | undefined,
  db: DbClient = prisma,
): Promise<{ code: string; name: string }> {
  if (bankCode?.trim()) {
    return resolveUserBankLedgerAccount(userId, bankCode, db);
  }
  return {
    code: LEDGER_ACCOUNTS.CARD_SETTLEMENT,
    name: LEDGER_ACCOUNT_NAMES[LEDGER_ACCOUNTS.CARD_SETTLEMENT] ?? "Card Settlement",
  };
}
