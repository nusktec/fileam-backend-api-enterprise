import { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import {
  LIABILITY_REPAYMENT_RECORD_STATUS,
  LIABILITY_RECORD_STATUS,
} from "../../constants/recordUndo";
import {
  LEDGER_REFERENCE_TYPES,
} from "../../constants/ledger";
import {
  LIABILITY_REPAYMENT_UNDO_REASONS,
  LIABILITY_UNDO_REASONS,
  RECORD_UNDO_ACTION,
  RECORD_UNDO_STATUS,
  isActiveRecordStatus,
  mapUndoPayload,
  undoStatusFromAction,
  type ExpenseUndoReason,
} from "../../constants/recordUndo";
import { SALE_STATUS } from "../../constants/salePaymentRules";
import { HttpReplyError } from "../../utils/httpReplyError";
import { normalizeMoneyAmount } from "../../utils/monetaryAmount";
import {
  latestReversalEntryId,
  latestReversalEntryIdForReferences,
  recordHasLedgerImpact,
  resolveUndoAction,
} from "../../services/recordUndoService";
import {
  reverseExpenseLedgerOnDelete,
  reverseLoanReceivedLedgerOnUndo,
  reverseLoanRepaymentLedgerOnUndo,
} from "../../services/ledgerSyncService";
import {
  liabilityRegisterService,
  liabilityRepaymentService,
} from "./liabilityRepaymentService";

function d(v: Decimal | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "number" ? v : Number(v);
}

function dec(n: number): Decimal {
  return new Decimal(n);
}

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

function assertLiabilityUndoReason(reason: string): string {
  const trimmed = reason.trim();
  if (!(LIABILITY_UNDO_REASONS as readonly string[]).includes(trimmed)) {
    throw new HttpReplyError(
      400,
      `reason must be one of: ${LIABILITY_UNDO_REASONS.join(", ")}`,
    );
  }
  return trimmed;
}

function assertRepaymentUndoReason(reason: string): ExpenseUndoReason {
  const trimmed = reason.trim();
  if (
    !(LIABILITY_REPAYMENT_UNDO_REASONS as readonly string[]).includes(trimmed)
  ) {
    throw new HttpReplyError(
      400,
      `reason must be one of: ${LIABILITY_REPAYMENT_UNDO_REASONS.join(", ")}`,
    );
  }
  return trimmed as ExpenseUndoReason;
}

function assertLiabilityLive(recordStatus: string): void {
  if (!isActiveRecordStatus(recordStatus)) {
    throw new HttpReplyError(409, "This liability has already been undone.");
  }
}

function assertRepaymentLive(recordStatus: string): void {
  if (recordStatus === LIABILITY_REPAYMENT_RECORD_STATUS.REVERSED) {
    throw new HttpReplyError(409, "This repayment has already been reversed.");
  }
}

async function assertNoLiveRepayments(
  userId: string,
  liabilityId: string,
): Promise<void> {
  const count = await prisma.liabilityRepayment.count({
    where: {
      userId,
      liabilityId,
      recordStatus: LIABILITY_REPAYMENT_RECORD_STATUS.ACTIVE,
    },
  });
  if (count > 0) {
    throw new HttpReplyError(
      409,
      "This liability cannot be undone because repayments have already been recorded. Undo those repayments first.",
    );
  }
}

type ScheduleRow = {
  id: string;
  dueDate: Date;
  amountDue: Decimal;
  amountPaid: Decimal;
  status: string;
};

function deallocateFromSchedule(
  items: ScheduleRow[],
  payment: number,
): Array<{ id: string; amountPaid: number; status: string }> {
  let remaining = payment;
  const updates: Array<{ id: string; amountPaid: number; status: string }> =
    [];
  const paid = items
    .filter((i) => d(i.amountPaid) > 0)
    .sort((a, b) => b.dueDate.getTime() - a.dueDate.getTime());

  for (const item of paid) {
    if (remaining <= 0) break;
    const currentPaid = d(item.amountPaid);
    const restore = Math.min(currentPaid, remaining);
    const newPaid = normalizeMoneyAmount(currentPaid - restore);
    remaining = normalizeMoneyAmount(remaining - restore);
    updates.push({
      id: item.id,
      amountPaid: newPaid,
      status:
        newPaid >= d(item.amountDue) - 0.001
          ? "PAID"
          : newPaid > 0
            ? "PARTIAL"
            : "PENDING",
    });
  }
  return updates;
}

function repaymentLookupVariants(repaymentIdOrCode: string): string[] {
  const trimmed = repaymentIdOrCode.trim();
  const variants = new Set<string>([trimmed]);
  if (trimmed.startsWith("REPAY-")) {
    variants.add(trimmed.replace(/^REPAY-/, "REP-"));
  } else if (trimmed.startsWith("REP-")) {
    variants.add(trimmed.replace(/^REP-/, "REPAY-"));
  }
  return [...variants];
}

async function findRepayment(userId: string, repaymentIdOrCode: string) {
  const lookupCodes = repaymentLookupVariants(repaymentIdOrCode);
  const row = await prisma.liabilityRepayment.findFirst({
    where: {
      userId,
      OR: [
        { id: repaymentIdOrCode },
        ...lookupCodes.map((repaymentCode) => ({ repaymentCode })),
      ],
    },
    include: {
      liability: {
        include: { schedule: { orderBy: { dueDate: "asc" } } },
      },
    },
  });
  if (!row) throw new HttpReplyError(404, "Repayment not found");
  return row;
}

async function findLiability(userId: string, liabilityIdOrCode: string) {
  const row = await prisma.registeredLiability.findFirst({
    where: {
      userId,
      OR: [{ id: liabilityIdOrCode }, { liabilityCode: liabilityIdOrCode }],
    },
    include: { schedule: { orderBy: { dueDate: "asc" } } },
  });
  if (!row) throw new HttpReplyError(404, "Registered liability not found");
  return row;
}

export const liabilityUndoService = {
  async getLiabilityUndoCheck(userId: string, liabilityIdOrCode: string) {
    const liability = await findLiability(userId, liabilityIdOrCode);
    assertLiabilityLive(liability.recordStatus);
    await assertNoLiveRepayments(userId, liability.id);

    const hasLedger = await recordHasLedgerImpact(userId, liability.id);
    const action = resolveUndoAction(hasLedger);
    if (action === RECORD_UNDO_ACTION.VOID && hasLedger) {
      throw new HttpReplyError(
        409,
        "This record cannot be undone as void because it has ledger impact.",
      );
    }
    return { action };
  },

  async undoLiability(userId: string, liabilityIdOrCode: string, reason: string) {
    const undoReason = assertLiabilityUndoReason(reason);
    const existing = await findLiability(userId, liabilityIdOrCode);
    assertLiabilityLive(existing.recordStatus);
    await assertNoLiveRepayments(userId, existing.id);

    const hasLedger = await recordHasLedgerImpact(userId, existing.id);
    const action = resolveUndoAction(hasLedger);
    if (action === RECORD_UNDO_ACTION.VOID && hasLedger) {
      throw new HttpReplyError(
        409,
        "This record cannot be undone as void because it has ledger impact.",
      );
    }

    const undoAt = new Date();
    const status = undoStatusFromAction(action);

    await prisma.$transaction(async (tx) => {
      let reversingEntryId: string | null = null;
      let reversingEntryDate: Date | null = null;

      if (action === RECORD_UNDO_ACTION.REVERSE) {
        await reverseLoanReceivedLedgerOnUndo(
          userId,
          existing.id,
          existing.startDate,
          tx,
        );
        reversingEntryId = await latestReversalEntryId(
          userId,
          LEDGER_REFERENCE_TYPES.LOAN_RECEIVED,
          existing.id,
          tx,
        );
        reversingEntryDate = undoAt;
      }

      await tx.registeredLiability.update({
        where: { id: existing.id },
        data: {
          recordStatus:
            action === RECORD_UNDO_ACTION.VOID
              ? LIABILITY_RECORD_STATUS.VOIDED
              : LIABILITY_RECORD_STATUS.REVERSED,
          undoAt,
          undoReason,
          reversingEntryId,
          reversingEntryDate,
        },
      });
    });

    const data = await liabilityRegisterService.getById(userId, existing.id);
    return { action, status, data };
  },

  async getRepaymentUndoCheck(userId: string, repaymentIdOrCode: string) {
    const repayment = await findRepayment(userId, repaymentIdOrCode);
    assertRepaymentLive(repayment.recordStatus);
    if (!isActiveRecordStatus(repayment.liability.recordStatus)) {
      throw new HttpReplyError(
        409,
        "This repayment cannot be undone because the liability has already been undone.",
      );
    }
    return { action: RECORD_UNDO_ACTION.REVERSE };
  },

  async undoRepayment(
    userId: string,
    repaymentIdOrCode: string,
    reason: string,
  ) {
    const undoReason = assertRepaymentUndoReason(reason);
    const existing = await findRepayment(userId, repaymentIdOrCode);
    assertRepaymentLive(existing.recordStatus);
    if (!isActiveRecordStatus(existing.liability.recordStatus)) {
      throw new HttpReplyError(
        409,
        "This repayment cannot be undone because the liability has already been undone.",
      );
    }

    const undoAt = new Date();
    const principalAmount = d(existing.principalAmount);
    const interestAmount = d(existing.interestAmount);
    const repaymentAmount = d(existing.repaymentAmount);
    const liability = existing.liability;

    await prisma.$transaction(async (tx) => {
      await reverseLoanRepaymentLedgerOnUndo(
        userId,
        existing.id,
        existing.paymentDate,
        tx,
      );

      if (existing.interestExpenseId) {
        const exp = await tx.expense.findFirst({
          where: { id: existing.interestExpenseId, userId },
        });
        if (exp) {
          await reverseExpenseLedgerOnDelete(
            userId,
            toExpenseLedgerRow(exp),
            tx,
          );
          await tx.expense.update({
            where: { id: exp.id },
            data: { status: SALE_STATUS.REVERSED },
          });
        }
      }
      if (existing.principalExpenseId) {
        const exp = await tx.expense.findFirst({
          where: { id: existing.principalExpenseId, userId },
        });
        if (exp) {
          await reverseExpenseLedgerOnDelete(
            userId,
            toExpenseLedgerRow(exp),
            tx,
          );
          await tx.expense.update({
            where: { id: exp.id },
            data: { status: SALE_STATUS.REVERSED },
          });
        }
      }

      const scheduleUpdates = deallocateFromSchedule(
        liability.schedule,
        repaymentAmount,
      );
      for (const u of scheduleUpdates) {
        await tx.liabilityScheduleItem.update({
          where: { id: u.id },
          data: {
            amountPaid: dec(u.amountPaid),
            status: u.status,
          },
        });
      }

      const newPrincipal = normalizeMoneyAmount(
        d(liability.outstandingPrincipal) + principalAmount,
      );
      const newAccrued = normalizeMoneyAmount(
        d(liability.accruedInterest) + interestAmount,
      );
      const newTotalPrincipalPaid = normalizeMoneyAmount(
        Math.max(0, d(liability.totalPrincipalPaid) - principalAmount),
      );
      const newTotalInterestPaid = normalizeMoneyAmount(
        Math.max(0, d(liability.totalInterestPaid) - interestAmount),
      );
      const newTotalRepaid = normalizeMoneyAmount(
        Math.max(0, d(liability.totalAmountRepaid) - repaymentAmount),
      );
      const newRepaymentCount = Math.max(0, liability.repaymentCount - 1);

      const remainingSchedule = await tx.liabilityScheduleItem.findMany({
        where: {
          liabilityId: liability.id,
          status: { in: ["PENDING", "PARTIAL"] },
        },
        orderBy: { dueDate: "asc" },
        take: 1,
      });
      const nextOpen = remainingSchedule[0] ?? null;

      const lastActive = await tx.liabilityRepayment.findFirst({
        where: {
          liabilityId: liability.id,
          recordStatus: LIABILITY_REPAYMENT_RECORD_STATUS.ACTIVE,
        },
        orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
        select: { paymentDate: true },
      });

      let paymentStatus = "PENDING";
      if (newPrincipal <= 0.001) paymentStatus = "FULLY_PAID";
      else if (newTotalRepaid > 0) paymentStatus = "PARTIALLY_PAID";

      await tx.registeredLiability.update({
        where: { id: liability.id },
        data: {
          outstandingPrincipal: dec(newPrincipal),
          accruedInterest: dec(newAccrued),
          totalPrincipalPaid: dec(newTotalPrincipalPaid),
          totalInterestPaid: dec(newTotalInterestPaid),
          totalAmountRepaid: dec(newTotalRepaid),
          paymentStatus,
          repaymentCount: newRepaymentCount,
          lastRepaymentDate: lastActive?.paymentDate ?? null,
          nextDueDate: nextOpen?.dueDate ?? liability.maturityDate,
        },
      });

      const reversingEntryId = await latestReversalEntryIdForReferences(
        userId,
        [
          {
            referenceType: LEDGER_REFERENCE_TYPES.LOAN_PRINCIPAL_PAID,
            referenceId: existing.id,
          },
          {
            referenceType: LEDGER_REFERENCE_TYPES.LOAN_INTEREST_PAID,
            referenceId: `${existing.id}:interest`,
          },
        ],
        tx,
      );

      await tx.liabilityRepayment.update({
        where: { id: existing.id },
        data: {
          recordStatus: LIABILITY_REPAYMENT_RECORD_STATUS.REVERSED,
          undoAt,
          undoReason,
          reversingEntryId,
          reversingEntryDate: undoAt,
        },
      });
    });

    const data = await liabilityRepaymentService.getById(
      userId,
      existing.repaymentCode,
    );
    return {
      action: RECORD_UNDO_ACTION.REVERSE,
      status: RECORD_UNDO_STATUS.REVERSED,
      data,
    };
  },
};

export function liabilityUndoFields(row: {
  recordStatus?: string;
  undoAt?: Date | null;
  undoReason?: string | null;
  reversingEntryId?: string | null;
  reversingEntryDate?: Date | null;
}) {
  return {
    recordStatus: row.recordStatus ?? LIABILITY_RECORD_STATUS.ACTIVE,
    undo: mapUndoPayload(row),
  };
}
