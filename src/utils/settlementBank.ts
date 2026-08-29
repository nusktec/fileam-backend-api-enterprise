import type { Prisma } from "@prisma/client";
import { prisma } from "../config/database";
import {
  isAsyncPaymentType,
  isCashPaymentType,
  isInvoicePaymentType,
  isTransferPaymentType,
} from "../constants/salePaymentRules";
import { HttpReplyError } from "./httpReplyError";
import { resolveUserBankLedgerAccount } from "./bankLedgerAccount";

type DbClient = Prisma.TransactionClient | typeof prisma;

/**
 * Resolve the business bank account for Transfer (required) or Card (optional).
 * Validates ownership against the user's registered bank accounts.
 */
export async function resolveSettlementBankCode(
  userId: string,
  paymentType: string,
  stored: string | null | undefined,
  provided: string | null | undefined,
  db: DbClient = prisma,
): Promise<string | null> {
  if (isCashPaymentType(paymentType) || isInvoicePaymentType(paymentType)) {
    return null;
  }
  if (!isAsyncPaymentType(paymentType)) {
    return null;
  }

  const code = (provided ?? stored)?.trim() || null;

  if (isTransferPaymentType(paymentType) && !code) {
    throw new HttpReplyError(
      400,
      "bankCode is required for Transfer payments (provide on create or payment-status confirm)",
      null,
      "VALIDATION_ERROR",
    );
  }

  if (code) {
    await resolveUserBankLedgerAccount(userId, code, db);
  }

  return code;
}
