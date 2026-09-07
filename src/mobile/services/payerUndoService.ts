import { prisma } from "../../config/database";
import {
  RECORD_UNDO_ACTION,
  RECORD_UNDO_STATUS,
  type PayerTransactionUndoReason,
  type PayerUndoReason,
  isUndoneStatus,
  undoStatusFromAction,
} from "../../constants/recordUndo";
import {
  assertNotAlreadyUndone,
  findPrimaryReversingEntry,
  recordHasLedgerImpact,
  resolveUndoAction,
} from "../../services/recordUndoService";
import { LEDGER_REFERENCE_TYPES } from "../../constants/ledger";
import { reversePayerTransactionLedgerOnUndo } from "../../services/ledgerSyncService";
import { HttpReplyError } from "../../utils/httpReplyError";
import { payersService } from "./payersService";

function assertPayerNotVoided(voided: boolean): void {
  if (voided) {
    throw new HttpReplyError(409, "This payer has already been voided");
  }
}

async function assertPayerHasNoTransactions(payerId: string): Promise<void> {
  const count = await prisma.payerTransaction.count({ where: { payerId } });
  if (count > 0) {
    throw new HttpReplyError(
      409,
      "This payer cannot be undone because it has transactions",
    );
  }
}

function assertTxnUndoable(status: string): void {
  if (status === "VOID") {
    throw new HttpReplyError(
      409,
      "This transaction has already been voided or reversed",
    );
  }
  assertNotAlreadyUndone(status, "transaction");
}

export const payerUndoService = {
  async getPayerUndoCheck(userId: string, payerId: string) {
    const payer = await prisma.payer.findFirst({
      where: { id: payerId, userId },
    });
    if (!payer) return null;
    assertPayerNotVoided(payer.voided);
    await assertPayerHasNoTransactions(payerId);
    return { action: RECORD_UNDO_ACTION.VOID };
  },

  async undoPayer(userId: string, payerId: string, reason: PayerUndoReason) {
    const payer = await prisma.payer.findFirst({
      where: { id: payerId, userId },
    });
    if (!payer) return null;

    assertPayerNotVoided(payer.voided);
    await assertPayerHasNoTransactions(payerId);
    const undoAt = new Date();

    await prisma.payer.update({
      where: { id: payerId },
      data: {
        voided: true,
        undoAt,
        undoReason: reason,
      },
    });

    const data = await payersService.getById(userId, payerId);
    return {
      action: RECORD_UNDO_ACTION.VOID,
      status: RECORD_UNDO_STATUS.VOIDED,
      data,
    };
  },

  async getTransactionUndoCheck(
    userId: string,
    payerId: string,
    transactionId: string,
  ) {
    const payer = await prisma.payer.findFirst({
      where: { id: payerId, userId },
    });
    if (!payer) return null;

    const txn = await prisma.payerTransaction.findFirst({
      where: { id: transactionId, payerId },
    });
    if (!txn) return null;
    assertTxnUndoable(txn.status);

    const hasLedger = await recordHasLedgerImpact(userId, txn.id);
    const action = resolveUndoAction(hasLedger);
    if (action === RECORD_UNDO_ACTION.VOID && hasLedger) {
      throw new HttpReplyError(
        409,
        "This transaction cannot be voided because it has accounting impact",
      );
    }
    return { action };
  },

  async undoTransaction(
    userId: string,
    payerId: string,
    transactionId: string,
    reason: PayerTransactionUndoReason,
  ) {
    const payer = await prisma.payer.findFirst({
      where: { id: payerId, userId },
    });
    if (!payer) return null;

    const txn = await prisma.payerTransaction.findFirst({
      where: { id: transactionId, payerId },
    });
    if (!txn) return null;

    assertTxnUndoable(txn.status);
    const hasLedger = await recordHasLedgerImpact(userId, txn.id);
    const action = resolveUndoAction(hasLedger);
    if (action === RECORD_UNDO_ACTION.VOID && hasLedger) {
      throw new HttpReplyError(
        409,
        "This transaction cannot be voided because it has accounting impact",
      );
    }

    const undoStatus = undoStatusFromAction(action);
    const undoAt = new Date();

    await prisma.$transaction(async (tx) => {
      let reversingEntryId: string | null = null;
      let reversingEntryDate: Date | null = null;

      if (action === RECORD_UNDO_ACTION.REVERSE) {
        await reversePayerTransactionLedgerOnUndo(
          userId,
          txn.id,
          txn.date,
          tx,
        );
        const entry = await findPrimaryReversingEntry(
          userId,
          LEDGER_REFERENCE_TYPES.PAYER_RECOGNITION,
          txn.id,
          tx,
        );
        reversingEntryId = entry?.id ?? null;
        reversingEntryDate = entry?.transactionDate ?? undoAt;
      }

      await tx.payerTransaction.update({
        where: { id: transactionId },
        data: {
          status: undoStatus,
          undoAt,
          undoReason: reason,
          reversingEntryId,
          reversingEntryDate,
        },
      });
    });

    const data = await payersService.getById(userId, payerId);
    return { action, status: undoStatus, data };
  },
};

export function isLivePayerTransaction(status: string): boolean {
  return !isUndoneStatus(status);
}
