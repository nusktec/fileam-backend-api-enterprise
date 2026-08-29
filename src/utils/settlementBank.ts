import type { Prisma } from "@prisma/client";
import { prisma } from "../config/database";
import {
  isCashPaymentType,
  isInvoicePaymentType,
  isAsyncPaymentType,
} from "../constants/salePaymentRules";
import { resolveUserBankLedgerAccount } from "./bankLedgerAccount";

type DbClient = Prisma.TransactionClient | typeof prisma;

/**
 * Optional business bank account for Transfer or Card.
 * Validates ownership when bankCode is provided.
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

  if (code) {
    await resolveUserBankLedgerAccount(userId, code, db);
  }

  return code;
}
