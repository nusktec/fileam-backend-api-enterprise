import { Prisma } from "@prisma/client";
import { prisma } from "../config/database";
import {
  LEDGER_REFERENCE_TYPES,
  LEDGER_STATUS,
  type LedgerEntryDraft,
} from "../constants/ledger";
import { HttpReplyError } from "../utils/httpReplyError";
import { normalizeMoneyAmount } from "../utils/monetaryAmount";

type DbClient = Prisma.TransactionClient | typeof prisma;

type PostLedgerInput = {
  userId: string;
  referenceType: string;
  referenceId?: string;
  description: string;
  transactionDate: Date;
  entries: LedgerEntryDraft[];
};

function assertBalanced(entries: LedgerEntryDraft[]): void {
  const totalDebit = normalizeMoneyAmount(
    entries.reduce((s, e) => s + e.debit, 0),
  );
  const totalCredit = normalizeMoneyAmount(
    entries.reduce((s, e) => s + e.credit, 0),
  );
  if (totalDebit !== totalCredit) {
    throw new HttpReplyError(
      500,
      "Ledger entries are not balanced",
    );
  }
  if (totalDebit <= 0) {
    throw new HttpReplyError(400, "Ledger transaction amount must be positive");
  }
}

export const ledgerService = {
  async post(input: PostLedgerInput, db: DbClient = prisma) {
    const entries = input.entries.map((e) => ({
      accountCode: e.accountCode,
      accountName: e.accountName,
      debit: normalizeMoneyAmount(e.debit),
      credit: normalizeMoneyAmount(e.credit),
    }));
    assertBalanced(entries);

    return db.ledgerTransaction.create({
      data: {
        userId: input.userId,
        referenceType: input.referenceType,
        referenceId: input.referenceId ?? null,
        description: input.description,
        transactionDate: input.transactionDate,
        status: LEDGER_STATUS.POSTED,
        entries: {
          create: entries,
        },
      },
      include: { entries: true },
    });
  },

  async reverse(
    userId: string,
    originalTransactionId: string,
    description: string,
    transactionDate: Date,
  ) {
    const original = await prisma.ledgerTransaction.findFirst({
      where: { id: originalTransactionId, userId, status: LEDGER_STATUS.POSTED },
      include: { entries: true },
    });
    if (!original) {
      throw new HttpReplyError(404, "Ledger transaction not found");
    }

    const reversalEntries: LedgerEntryDraft[] = original.entries.map((e) => ({
      accountCode: e.accountCode,
      accountName: e.accountName,
      debit: Number(e.credit),
      credit: Number(e.debit),
    }));

    const reversal = await prisma.$transaction(async (tx) => {
      const created = await tx.ledgerTransaction.create({
        data: {
          userId,
          referenceType: LEDGER_REFERENCE_TYPES.REVERSAL,
          referenceId: original.id,
          description,
          transactionDate,
          status: LEDGER_STATUS.POSTED,
          reversalOfId: original.id,
          entries: {
            create: reversalEntries.map((e) => ({
              accountCode: e.accountCode,
              accountName: e.accountName,
              debit: normalizeMoneyAmount(e.debit),
              credit: normalizeMoneyAmount(e.credit),
            })),
          },
        },
        include: { entries: true },
      });
      await tx.ledgerTransaction.update({
        where: { id: original.id },
        data: { status: LEDGER_STATUS.REVERSED },
      });
      return created;
    });

    return reversal;
  },
};
