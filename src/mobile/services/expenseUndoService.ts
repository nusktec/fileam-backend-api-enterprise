import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import {
  LEDGER_REFERENCE_TYPES,
} from "../../constants/ledger";
import {
  RECORD_UNDO_ACTION,
  RECORD_UNDO_STATUS,
  type ExpenseUndoReason,
  undoStatusFromAction,
} from "../../constants/recordUndo";
import { SALE_STATUS } from "../../constants/salePaymentRules";
import {
  assertNotAlreadyUndone,
  findPrimaryReversingEntry,
  recordHasLedgerImpact,
  resolveUndoAction,
} from "../../services/recordUndoService";
import {
  reverseExpenseLedgerOnDelete,
} from "../../services/ledgerSyncService";
import { calendarPeriodFromDate } from "../../utils/dateRangeQuery";
import { HttpReplyError } from "../../utils/httpReplyError";
import { taxPayablesService } from "./taxPayablesService";
import { expensesService } from "./expensesService";

function toExpenseLedgerRow(expense: {
  id: string;
  paymentType: string;
  status: string;
  totalAmount: Decimal;
  invoiceAmountPaid: unknown;
  expenseDate: Date;
  settlementBankCode?: string | null;
}) {
  return {
    id: expense.id,
    paymentType: expense.paymentType,
    status: expense.status,
    totalAmount: expense.totalAmount,
    invoiceAmountPaid: expense.invoiceAmountPaid,
    expenseDate: expense.expenseDate,
    settlementBankCode: expense.settlementBankCode ?? null,
  };
}

function assertExpenseCanUndo(expense: {
  status: string;
  convertedToAssetId: string | null;
}): void {
  assertNotAlreadyUndone(expense.status, "expense");
  if (expense.convertedToAssetId) {
    throw new HttpReplyError(
      409,
      "This expense cannot be undone because it was converted to an asset",
    );
  }
}

export const expenseUndoService = {
  async getUndoCheck(userId: string, expenseId: string) {
    const expense = await prisma.expense.findFirst({
      where: { id: expenseId, userId },
    });
    if (!expense) return null;

    assertExpenseCanUndo(expense);
    const hasLedger = await recordHasLedgerImpact(userId, expense.id);
    const action = resolveUndoAction(hasLedger);

    if (action === RECORD_UNDO_ACTION.VOID && hasLedger) {
      throw new HttpReplyError(
        409,
        "This expense cannot be voided because it has accounting impact",
      );
    }

    return { action };
  },

  async undo(userId: string, expenseId: string, reason: ExpenseUndoReason) {
    const expense = await prisma.expense.findFirst({
      where: { id: expenseId, userId },
    });
    if (!expense) return null;

    assertExpenseCanUndo(expense);
    const hasLedger = await recordHasLedgerImpact(userId, expense.id);
    const action = resolveUndoAction(hasLedger);

    if (action === RECORD_UNDO_ACTION.VOID && hasLedger) {
      throw new HttpReplyError(
        409,
        "This expense cannot be voided because it has accounting impact",
      );
    }

    const undoStatus = undoStatusFromAction(action);
    const undoAt = new Date();
    const period = calendarPeriodFromDate(expense.expenseDate);

    await prisma.$transaction(async (tx) => {
      let reversingEntryId: string | null = null;
      let reversingEntryDate: Date | null = null;

      if (action === RECORD_UNDO_ACTION.REVERSE) {
        await reverseExpenseLedgerOnDelete(
          userId,
          toExpenseLedgerRow(expense),
          tx,
        );
        const entry = await findPrimaryReversingEntry(
          userId,
          LEDGER_REFERENCE_TYPES.EXPENSE_RECOGNITION,
          expense.id,
          tx,
        );
        reversingEntryId = entry?.id ?? null;
        reversingEntryDate = entry?.transactionDate ?? undoAt;
      }

      await tx.expense.update({
        where: { id: expenseId },
        data: {
          status:
            undoStatus === RECORD_UNDO_STATUS.VOIDED
              ? SALE_STATUS.VOIDED
              : SALE_STATUS.REVERSED,
          undoAt,
          undoReason: reason,
          reversingEntryId,
          reversingEntryDate,
        },
      });
    });

    await taxPayablesService.syncPayablesForPeriods(userId, [period]);

    const data = await expensesService.getById(userId, expenseId);
    return {
      action,
      status: undoStatus,
      data,
    };
  },
};
