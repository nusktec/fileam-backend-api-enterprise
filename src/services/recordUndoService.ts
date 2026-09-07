import type { Prisma } from "@prisma/client";
import { prisma } from "../config/database";
import {
  LEDGER_REFERENCE_TYPES,
  LEDGER_STATUS,
} from "../constants/ledger";
import {
  isUndoneStatus,
  RECORD_UNDO_ACTION,
  type RecordUndoAction,
} from "../constants/recordUndo";
import { HttpReplyError } from "../utils/httpReplyError";

type DbClient = Prisma.TransactionClient | typeof prisma;

/** True when any posted ledger row exists for this business record. */
export async function recordHasLedgerImpact(
  userId: string,
  referenceId: string,
): Promise<boolean> {
  const count = await prisma.ledgerTransaction.count({
    where: {
      userId,
      referenceId,
      status: LEDGER_STATUS.POSTED,
      referenceType: {
        not: LEDGER_REFERENCE_TYPES.REVERSAL,
      },
    },
  });
  return count > 0;
}

export function resolveUndoAction(hasLedger: boolean): RecordUndoAction {
  return hasLedger ? RECORD_UNDO_ACTION.REVERSE : RECORD_UNDO_ACTION.VOID;
}

export function assertNotAlreadyUndone(
  status: string | null | undefined,
  label = "record",
): void {
  if (isUndoneStatus(status)) {
    throw new HttpReplyError(
      409,
      `This ${label} has already been voided or reversed`,
    );
  }
}

/** Primary reversal journal created when undo reverses recognition. */
export async function findPrimaryReversingEntry(
  userId: string,
  referenceType: string,
  referenceId: string,
  db: DbClient = prisma,
): Promise<{ id: string; transactionDate: Date } | null> {
  const original = await db.ledgerTransaction.findFirst({
    where: {
      userId,
      referenceType,
      referenceId,
      status: LEDGER_STATUS.REVERSED,
    },
    orderBy: { createdAt: "asc" },
  });
  if (!original) return null;

  const reversal = await db.ledgerTransaction.findFirst({
    where: {
      userId,
      referenceType: LEDGER_REFERENCE_TYPES.REVERSAL,
      reversalOfId: original.id,
      status: LEDGER_STATUS.POSTED,
    },
    orderBy: { createdAt: "asc" },
  });
  if (!reversal) return null;

  return {
    id: reversal.id,
    transactionDate: reversal.transactionDate,
  };
}

/** Most recent reversal journal id for posted rows reversed on this reference. */
export async function latestReversalEntryId(
  userId: string,
  referenceType: string,
  referenceId: string,
  db: DbClient = prisma,
): Promise<string | null> {
  const originals = await db.ledgerTransaction.findMany({
    where: {
      userId,
      referenceType,
      referenceId,
      status: LEDGER_STATUS.REVERSED,
    },
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });
  if (originals.length === 0) return null;

  const reversal = await db.ledgerTransaction.findFirst({
    where: {
      userId,
      referenceType: LEDGER_REFERENCE_TYPES.REVERSAL,
      reversalOfId: { in: originals.map((o: { id: string }) => o.id) },
    },
    orderBy: { createdAt: "desc" },
  });
  return reversal?.id ?? null;
}

/** First reversal journal id across multiple reference ids (e.g. sale + collections). */
export async function latestReversalEntryIdForReferences(
  userId: string,
  pairs: Array<{ referenceType: string; referenceId: string }>,
  db: DbClient = prisma,
): Promise<string | null> {
  let latest: { id: string; createdAt: Date } | null = null;
  for (const { referenceType, referenceId } of pairs) {
    const originals = await db.ledgerTransaction.findMany({
      where: {
        userId,
        referenceType,
        referenceId,
        status: LEDGER_STATUS.REVERSED,
      },
      select: { id: true },
    });
    if (originals.length === 0) continue;
    const reversal = await db.ledgerTransaction.findFirst({
      where: {
        userId,
        referenceType: LEDGER_REFERENCE_TYPES.REVERSAL,
        reversalOfId: { in: originals.map((o: { id: string }) => o.id) },
      },
      orderBy: { createdAt: "desc" },
    });
    if (
      reversal &&
      (!latest || reversal.createdAt.getTime() > latest.createdAt.getTime())
    ) {
      latest = { id: reversal.id, createdAt: reversal.createdAt };
    }
  }
  return latest?.id ?? null;
}
