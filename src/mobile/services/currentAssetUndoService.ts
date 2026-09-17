import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import {
  LEDGER_ACCOUNTS,
  LEDGER_REFERENCE_TYPES,
  LEDGER_STATUS,
} from "../../constants/ledger";
import {
  isUndoneStatus,
  mapUndoPayload,
  RECORD_UNDO_ACTION,
  type AssetBankUndoReason,
  type AssetCashUndoReason,
  undoStatusFromAction,
} from "../../constants/recordUndo";
import { CASH_TYPE_LABELS, BANK_ACCOUNT_TYPE_LABELS } from "../../constants/cashBank";
import {
  assertNotAlreadyUndone,
  findPrimaryReversingEntry,
  recordHasLedgerImpact,
  resolveUndoAction,
} from "../../services/recordUndoService";
import {
  reverseBankOpeningLedgerOnUndo,
  reverseCashOpeningLedgerOnUndo,
} from "../../services/ledgerSyncService";
import { HttpReplyError } from "../../utils/httpReplyError";
import { normalizeMoneyAmount } from "../../utils/monetaryAmount";

const SYSTEM_CASH_IDS = new Set(["system-cash"]);
const SYSTEM_BANK_IDS = new Set(["system-bank", "card-settlement"]);

type DbClient = Prisma.TransactionClient | typeof prisma;

function d(v: { toNumber?: () => number } | number | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === "object" && typeof v.toNumber === "function") {
    return v.toNumber();
  }
  return Number(v);
}

async function resolveUndoOrThrow(
  userId: string,
  referenceId: string,
  label: string,
) {
  const hasLedger = await recordHasLedgerImpact(userId, referenceId);
  const action = resolveUndoAction(hasLedger);
  if (action === RECORD_UNDO_ACTION.VOID && hasLedger) {
    throw new HttpReplyError(
      409,
      `This ${label} cannot be voided because it has accounting impact`,
    );
  }
  return action;
}

async function findCash(userId: string, id: string) {
  return prisma.cashBalance.findFirst({
    where: { userId, OR: [{ id }, { cashCode: id }] },
  });
}

async function findBank(userId: string, id: string) {
  return prisma.bankAccount.findFirst({
    where: { userId, OR: [{ id }, { bankCode: id }] },
  });
}

async function bankHasOtherLivePostings(
  userId: string,
  bank: { id: string; bankCode: string },
  db: DbClient = prisma,
): Promise<boolean> {
  const count = await db.ledgerEntry.count({
    where: {
      accountCode: `${LEDGER_ACCOUNTS.BANK}:${bank.bankCode}`,
      transaction: {
        userId,
        status: LEDGER_STATUS.POSTED,
        referenceType: { not: LEDGER_REFERENCE_TYPES.REVERSAL },
        NOT: {
          referenceType: LEDGER_REFERENCE_TYPES.BANK_OPENING,
          referenceId: bank.id,
        },
      },
    },
  });
  return count > 0;
}

export function mapCurrentAssetCashItem(row: {
  id: string;
  cashCode: string;
  cashType: string;
  note: string | null;
  amount: { toNumber?: () => number } | number;
  status: string;
  undoAt?: Date | null;
  undoReason?: string | null;
  reversingEntryId?: string | null;
  reversingEntryDate?: Date | null;
}) {
  return {
    id: row.id,
    cashCode: row.cashCode,
    cashType: row.cashType,
    title: CASH_TYPE_LABELS[row.cashType as keyof typeof CASH_TYPE_LABELS] ?? row.cashType,
    subtitle: row.note ?? "User-added cash balance",
    amount: normalizeMoneyAmount(d(row.amount)),
    source: "user" as const,
    status: row.status,
    undo: mapUndoPayload(row),
  };
}

export function mapCurrentAssetBankItem(row: {
  id: string;
  bankCode: string;
  bankName: string;
  accountType: string;
  accountNumber: string;
  openingBalance: { toNumber?: () => number } | number;
  status: string;
  undoAt?: Date | null;
  undoReason?: string | null;
  reversingEntryId?: string | null;
  reversingEntryDate?: Date | null;
}, amount: number) {
  return {
    id: row.id,
    bankCode: row.bankCode,
    bankName: row.bankName,
    accountType:
      BANK_ACCOUNT_TYPE_LABELS[
        row.accountType as keyof typeof BANK_ACCOUNT_TYPE_LABELS
      ] ?? row.accountType,
    accountNumber: row.accountNumber,
    amount: normalizeMoneyAmount(amount),
    source: "user" as const,
    status: row.status,
    undo: mapUndoPayload(row),
  };
}

export const currentAssetUndoService = {
  async getCashUndoCheck(userId: string, id: string) {
    if (SYSTEM_CASH_IDS.has(id)) {
      throw new HttpReplyError(
        409,
        "This cash record cannot be undone from here. Undo the source sale, expense, or asset.",
      );
    }
    const row = await findCash(userId, id);
    if (!row) return null;
    assertNotAlreadyUndone(row.status, "cash record");
    const action = await resolveUndoOrThrow(userId, row.id, "cash record");
    return { action };
  },

  async undoCash(userId: string, id: string, reason: AssetCashUndoReason) {
    if (SYSTEM_CASH_IDS.has(id)) {
      throw new HttpReplyError(
        409,
        "This cash record cannot be undone from here. Undo the source sale, expense, or asset.",
      );
    }
    const row = await findCash(userId, id);
    if (!row) return null;
    assertNotAlreadyUndone(row.status, "cash record");
    const action = await resolveUndoOrThrow(userId, row.id, "cash record");
    const undoStatus = undoStatusFromAction(action);
    const undoAt = new Date();

    await prisma.$transaction(async (tx) => {
      let reversingEntryId: string | null = null;
      let reversingEntryDate: Date | null = null;
      if (action === RECORD_UNDO_ACTION.REVERSE) {
        await reverseCashOpeningLedgerOnUndo(userId, row.id, undoAt, tx);
        const entry = await findPrimaryReversingEntry(
          userId,
          LEDGER_REFERENCE_TYPES.CASH_OPENING,
          row.id,
          tx,
        );
        reversingEntryId = entry?.id ?? null;
        reversingEntryDate = entry?.transactionDate ?? undoAt;
      }
      await tx.cashBalance.update({
        where: { id: row.id },
        data: {
          status: undoStatus,
          undoAt,
          undoReason: reason,
          reversingEntryId,
          reversingEntryDate,
        },
      });
    });

    const data = await findCash(userId, row.id);
    return {
      action,
      status: undoStatus,
      data: data ? mapCurrentAssetCashItem(data) : null,
    };
  },

  async getBankUndoCheck(userId: string, id: string) {
    if (SYSTEM_BANK_IDS.has(id)) {
      throw new HttpReplyError(
        409,
        "This bank account cannot be undone from here. Undo the source sale, expense, or asset.",
      );
    }
    const row = await findBank(userId, id);
    if (!row) return null;
    assertNotAlreadyUndone(row.status, "bank account");
    if (await bankHasOtherLivePostings(userId, row)) {
      throw new HttpReplyError(
        409,
        "This bank account cannot be undone because it has already been used.",
      );
    }
    const action = await resolveUndoOrThrow(userId, row.id, "bank account");
    return { action };
  },

  async undoBank(userId: string, id: string, reason: AssetBankUndoReason) {
    if (SYSTEM_BANK_IDS.has(id)) {
      throw new HttpReplyError(
        409,
        "This bank account cannot be undone from here. Undo the source sale, expense, or asset.",
      );
    }
    const row = await findBank(userId, id);
    if (!row) return null;
    assertNotAlreadyUndone(row.status, "bank account");
    if (await bankHasOtherLivePostings(userId, row)) {
      throw new HttpReplyError(
        409,
        "This bank account cannot be undone because it has already been used.",
      );
    }
    const action = await resolveUndoOrThrow(userId, row.id, "bank account");
    const undoStatus = undoStatusFromAction(action);
    const undoAt = new Date();

    await prisma.$transaction(async (tx) => {
      let reversingEntryId: string | null = null;
      let reversingEntryDate: Date | null = null;
      if (action === RECORD_UNDO_ACTION.REVERSE) {
        await reverseBankOpeningLedgerOnUndo(
          userId,
          row.id,
          row.balanceDate,
          tx,
        );
        const entry = await findPrimaryReversingEntry(
          userId,
          LEDGER_REFERENCE_TYPES.BANK_OPENING,
          row.id,
          tx,
        );
        reversingEntryId = entry?.id ?? null;
        reversingEntryDate = entry?.transactionDate ?? undoAt;
      }
      await tx.bankAccount.update({
        where: { id: row.id },
        data: {
          status: undoStatus,
          undoAt,
          undoReason: reason,
          reversingEntryId,
          reversingEntryDate,
        },
      });
    });

    const data = await findBank(userId, row.id);
    return {
      action,
      status: undoStatus,
      data: data
        ? mapCurrentAssetBankItem(data, d(data.openingBalance))
        : null,
    };
  },
};

export function isLiveUserAddedStatus(status: string | null | undefined) {
  return !isUndoneStatus(status);
}
