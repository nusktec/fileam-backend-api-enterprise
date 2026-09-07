import { prisma } from "../../config/database";
import {
  RECORD_UNDO_ACTION,
  RECORD_UNDO_STATUS,
  type BeneficiaryTransactionUndoReason,
  type BeneficiaryUndoReason,
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
import { reverseBeneficiaryTransactionLedgerOnUndo } from "../../services/ledgerSyncService";
import { HttpReplyError } from "../../utils/httpReplyError";
import { beneficiariesService } from "./beneficiariesService";

function assertBeneficiaryNotVoided(voided: boolean): void {
  if (voided) {
    throw new HttpReplyError(409, "This beneficiary has already been voided");
  }
}

async function assertBeneficiaryHasNoTransactions(
  beneficiaryId: string,
): Promise<void> {
  const count = await prisma.beneficiaryTransaction.count({
    where: { beneficiaryId },
  });
  if (count > 0) {
    throw new HttpReplyError(
      409,
      "This beneficiary cannot be undone because it has transactions",
    );
  }
}

export const beneficiaryUndoService = {
  async getBeneficiaryUndoCheck(userId: string, beneficiaryId: string) {
    const row = await prisma.beneficiary.findFirst({
      where: { id: beneficiaryId, userId },
    });
    if (!row) return null;
    assertBeneficiaryNotVoided(row.voided);
    await assertBeneficiaryHasNoTransactions(beneficiaryId);
    return { action: RECORD_UNDO_ACTION.VOID };
  },

  async undoBeneficiary(
    userId: string,
    beneficiaryId: string,
    reason: BeneficiaryUndoReason,
  ) {
    const row = await prisma.beneficiary.findFirst({
      where: { id: beneficiaryId, userId },
    });
    if (!row) return null;

    assertBeneficiaryNotVoided(row.voided);
    await assertBeneficiaryHasNoTransactions(beneficiaryId);
    const undoAt = new Date();

    await prisma.beneficiary.update({
      where: { id: beneficiaryId },
      data: {
        voided: true,
        undoAt,
        undoReason: reason,
      },
    });

    const data = await beneficiariesService.getById(userId, beneficiaryId);
    return {
      action: RECORD_UNDO_ACTION.VOID,
      status: RECORD_UNDO_STATUS.VOIDED,
      data,
    };
  },

  async getTransactionUndoCheck(
    userId: string,
    beneficiaryId: string,
    transactionId: string,
  ) {
    const row = await prisma.beneficiary.findFirst({
      where: { id: beneficiaryId, userId },
    });
    if (!row) return null;

    const txn = await prisma.beneficiaryTransaction.findFirst({
      where: { id: transactionId, beneficiaryId },
    });
    if (!txn) return null;
    assertNotAlreadyUndone(txn.status, "transaction");

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
    beneficiaryId: string,
    transactionId: string,
    reason: BeneficiaryTransactionUndoReason,
  ) {
    const row = await prisma.beneficiary.findFirst({
      where: { id: beneficiaryId, userId },
    });
    if (!row) return null;

    const txn = await prisma.beneficiaryTransaction.findFirst({
      where: { id: transactionId, beneficiaryId },
    });
    if (!txn) return null;

    assertNotAlreadyUndone(txn.status, "transaction");
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
    const wasRemitted = txn.status === "REMITTED";

    await prisma.$transaction(async (tx) => {
      let reversingEntryId: string | null = null;
      let reversingEntryDate: Date | null = null;

      if (action === RECORD_UNDO_ACTION.REVERSE) {
        await reverseBeneficiaryTransactionLedgerOnUndo(
          userId,
          txn.id,
          txn.date,
          { remitted: wasRemitted },
          tx,
        );
        const refType =
          txn.entryType === "INVOICE"
            ? LEDGER_REFERENCE_TYPES.BENEFICIARY_INVOICE
            : LEDGER_REFERENCE_TYPES.BENEFICIARY_PAYMENT;
        const entry = await findPrimaryReversingEntry(
          userId,
          refType,
          txn.id,
          tx,
        );
        reversingEntryId = entry?.id ?? null;
        reversingEntryDate = entry?.transactionDate ?? undoAt;
      }

      if (txn.invoiceId && txn.entryType === "PAYMENT") {
        await tx.beneficiaryTransaction.updateMany({
          where: { id: txn.invoiceId, beneficiaryId },
          data: { invoiceStatus: "UNPAID" },
        });
      }

      await tx.beneficiaryTransaction.update({
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

    await beneficiariesService.recomputeBalances(beneficiaryId);
    const data = await beneficiariesService.getById(userId, beneficiaryId);
    return { action, status: undoStatus, data };
  },
};

export function isLiveBeneficiaryTransaction(status: string): boolean {
  return !isUndoneStatus(status);
}
