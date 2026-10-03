/**
 * Double-entry postings per transaction matrix (1.pdf).
 * Every business event posts balanced Dr/Cr lines via ledgerService.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "../config/database";
import {
  LEDGER_ACCOUNTS,
  LEDGER_ACCOUNT_NAMES,
  LEDGER_REFERENCE_TYPES,
  LEDGER_STATUS,
  type LedgerEntryDraft,
} from "../constants/ledger";
import { CHART_BY_CODE } from "../constants/chartOfAccounts";
import {
  isCashPaymentType,
  isInvoicePaymentType,
  isPendingAsyncPaymentType,
  isSalePaidStatus,
  PAYMENT_TYPE_CARD,
  PAYMENT_TYPE_CASH,
} from "../constants/salePaymentRules";
import { coerceInvoiceAmountPaid } from "../constants/invoiceAmountPaid";
import { ledgerService } from "./ledgerService";
import { normalizeMoneyAmount } from "../utils/monetaryAmount";
import {
  resolveBankLedgerAccount,
  resolveCardSettlementLedgerAccount,
} from "../utils/bankLedgerAccount";
import { isTransferPaymentType } from "../constants/salePaymentRules";
import { HttpReplyError } from "../utils/httpReplyError";
import {
  displayRecordNumber,
  expensePaymentDescription,
  expenseRecognitionDescription,
  saleCollectionDescription,
  saleRecognitionDescription,
} from "../utils/ledgerEntryDescription";
import {
  expenseBalanceSheetKind,
  fixedAssetLedgerCode,
  isFinalWhtIncomeCategory,
  isPayerIncomePurpose,
  payerIncomeAccount,
} from "../constants/ledgerPostingRules";

type DbClient = Prisma.TransactionClient | typeof prisma;

function account(code: string, name?: string): { code: string; name: string } {
  return {
    code,
    name:
      name ??
      LEDGER_ACCOUNT_NAMES[code] ??
      CHART_BY_CODE.get(code)?.name ??
      code,
  };
}

function line(
  acct: { code: string; name: string },
  debit: number,
  credit: number,
): LedgerEntryDraft {
  return {
    accountCode: acct.code,
    accountName: acct.name,
    debit: normalizeMoneyAmount(debit),
    credit: normalizeMoneyAmount(credit),
  };
}

/** Payment destination: Cash → Cash; Transfer → BANK:{bankCode} or BANK; Card → mapped bank or CARD_SETTLEMENT. */
async function resolvePaymentAssetAccount(
  userId: string,
  paymentType: string,
  bankCode: string | null | undefined,
  db: DbClient = prisma,
): Promise<{ code: string; name: string }> {
  if (isCashPaymentType(paymentType)) {
    return account(LEDGER_ACCOUNTS.CASH_ON_HAND);
  }
  if (paymentType === PAYMENT_TYPE_CARD) {
    return resolveCardSettlementLedgerAccount(userId, bankCode, db);
  }
  if (isTransferPaymentType(paymentType)) {
    return resolveBankLedgerAccount(userId, bankCode, db);
  }
  throw new HttpReplyError(
    400,
    `Unsupported payment asset type: ${paymentType}`,
    null,
    "VALIDATION_ERROR",
  );
}

function primaryReferenceId(referenceId: string): string {
  return referenceId.split(":")[0] ?? referenceId;
}

async function saleInvoiceNumber(
  saleId: string,
  db: DbClient,
): Promise<string> {
  const row = await db.sale.findUnique({
    where: { id: saleId },
    select: { invoiceNumber: true },
  });
  return row?.invoiceNumber ?? saleId;
}

async function expenseNumberLabel(
  expenseId: string,
  db: DbClient,
): Promise<string> {
  const row = await db.expense.findUnique({
    where: { id: expenseId },
    select: { expenseNumber: true },
  });
  return row?.expenseNumber ?? expenseId;
}

async function postOnce(
  input: Parameters<typeof ledgerService.post>[0],
  db: DbClient = prisma,
) {
  if (input.referenceId) {
    const existing = await db.ledgerTransaction.findFirst({
      where: {
        userId: input.userId,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        status: LEDGER_STATUS.POSTED,
      },
    });
    if (existing) return existing;
  }
  return ledgerService.post(input, db);
}

function saleRecognitionEntries(input: {
  netRevenue: number;
  vatAmount: number;
  collectedAmount: number;
  arAmount: number;
  collectedAsset: { code: string; name: string };
}): LedgerEntryDraft[] {
  const net = normalizeMoneyAmount(input.netRevenue);
  const vat = normalizeMoneyAmount(input.vatAmount);
  const collected = normalizeMoneyAmount(input.collectedAmount);
  const ar = normalizeMoneyAmount(input.arAmount);

  const entries: LedgerEntryDraft[] = [];

  if (collected > 0) {
    entries.push(line(input.collectedAsset, collected, 0));
  }
  if (ar > 0) {
    entries.push(line(account(LEDGER_ACCOUNTS.CUSTOMER_AR), ar, 0));
  }
  if (net > 0) {
    entries.push(line(account(LEDGER_ACCOUNTS.SALES_REVENUE), 0, net));
  }
  if (vat > 0) {
    entries.push(line(account(LEDGER_ACCOUNTS.VAT_PAYABLE), 0, vat));
  }

  return entries;
}

export const ledgerPostingService = {
  /** Cash sale, credit sale (Transfer/Card pending), or invoice (full AR). */
  async postSaleRecognition(
    userId: string,
    sale: {
      id: string;
      paymentType: string;
      status: string;
      amount: number | { toNumber?: () => number };
      vatAmount: number | { toNumber?: () => number } | null;
      totalAmount: number | { toNumber?: () => number };
      invoiceAmountPaid?: unknown;
      saleDate: Date;
      settlementBankCode?: string | null;
    },
    db: DbClient = prisma,
    opts?: {
      postInvoiceCollections?: boolean;
      /** Bulk Transfer/Cash PAID on create — post collected amount to paymentType asset (Bank/Cash), not Cash only. */
      settleCollectedToPaymentType?: boolean;
    },
  ) {
    const netRevenue = Number(sale.amount);
    const vatAmount = sale.vatAmount != null ? Number(sale.vatAmount) : 0;
    const totalAmount = Number(sale.totalAmount);
    const paid = coerceInvoiceAmountPaid(sale.invoiceAmountPaid ?? 0);

    const isInvoice = isInvoicePaymentType(sale.paymentType);
    const pendingAsync =
      isPendingAsyncPaymentType(sale.paymentType) &&
      !isSalePaidStatus(sale.status);

    let collected = 0;
    let ar = 0;

    if (isInvoice) {
      ar = totalAmount;
    } else if (pendingAsync) {
      ar = totalAmount;
    } else {
      collected = totalAmount;
    }

    const collectedAsset =
      collected > 0 && opts?.settleCollectedToPaymentType
        ? await resolvePaymentAssetAccount(
            userId,
            sale.paymentType,
            sale.settlementBankCode,
            db,
          )
        : await resolvePaymentAssetAccount(
            userId,
            PAYMENT_TYPE_CASH,
            null,
            db,
          );
    const entries = saleRecognitionEntries({
      netRevenue,
      vatAmount,
      collectedAmount: collected,
      arAmount: ar,
      collectedAsset,
    });
    if (entries.length === 0 || totalAmount <= 0) return null;

    const invoiceNumber = await saleInvoiceNumber(sale.id, db);
    const tx = await postOnce(
      {
        userId,
        referenceType: LEDGER_REFERENCE_TYPES.SALE_RECOGNITION,
        referenceId: sale.id,
        description: saleRecognitionDescription(invoiceNumber),
        transactionDate: sale.saleDate,
        entries,
      },
      db,
    );

    const postInvoiceCollections = opts?.postInvoiceCollections !== false;

    if (isInvoice && paid.items.length > 0 && postInvoiceCollections) {
      for (let i = 0; i < paid.items.length; i++) {
        const item = paid.items[i]!;
        if (item.amount <= 0) continue;
        await postOnce(
          {
            userId,
            referenceType: LEDGER_REFERENCE_TYPES.SALE_COLLECTION,
            referenceId: `${sale.id}:inv:${i}`,
            description: saleCollectionDescription(invoiceNumber),
            transactionDate: sale.saleDate,
            entries: [
              line(
                await resolvePaymentAssetAccount(
                  userId,
                  item.paymentType,
                  item.bankCode ?? sale.settlementBankCode,
                  db,
                ),
                item.amount,
                0,
              ),
              line(account(LEDGER_ACCOUNTS.CUSTOMER_AR), 0, item.amount),
            ],
          },
          db,
        );
      }
    }

    return tx;
  },

  /** Customer payment clearing AR (invoice settlement or async confirm). */
  async postSaleCollection(
    userId: string,
    saleId: string,
    amount: number,
    paymentType: string,
    transactionDate: Date,
    suffix = "full",
    bankCode?: string | null,
    db: DbClient = prisma,
  ) {
    const amt = normalizeMoneyAmount(amount);
    if (amt <= 0) return null;

    const asset = await resolvePaymentAssetAccount(
      userId,
      paymentType,
      bankCode,
      db,
    );

    const invoiceNumber = await saleInvoiceNumber(
      primaryReferenceId(saleId),
      db,
    );
    return postOnce(
      {
        userId,
        referenceType: LEDGER_REFERENCE_TYPES.SALE_COLLECTION,
        referenceId: `${saleId}:${suffix}`,
        description: saleCollectionDescription(invoiceNumber),
        transactionDate,
        entries: [
          line(asset, amt, 0),
          line(account(LEDGER_ACCOUNTS.CUSTOMER_AR), 0, amt),
        ],
      },
      db,
    );
  },

  /** Expense paid (Dr Expense, Cr Cash/Bank) or on credit (Dr Expense, Cr AP). */
  async postExpenseRecognition(
    userId: string,
    expense: {
      id: string;
      paymentType: string;
      status: string;
      totalAmount: number | { toNumber?: () => number };
      amount?: number | { toNumber?: () => number };
      vatAmount?: number | { toNumber?: () => number } | null;
      category?: string | null;
      expenseType?: string | null;
      purchaseKind?: string | null;
      invoiceAmountPaid?: unknown;
      expenseDate: Date;
      settlementBankCode?: string | null;
    },
    db: DbClient = prisma,
    opts?: {
      postInvoiceCollections?: boolean;
      /** Bulk Transfer/Cash PAID on create — settle to paymentType asset (Bank/Cash), not AP + cash. */
      settleCollectedToPaymentType?: boolean;
    },
  ) {
    const total = normalizeMoneyAmount(Number(expense.totalAmount));
    if (total <= 0) return null;

    const netExpense = normalizeMoneyAmount(
      expense.amount != null ? Number(expense.amount) : total,
    );
    const inputVat = normalizeMoneyAmount(
      expense.vatAmount != null ? Number(expense.vatAmount) : Math.max(0, total - netExpense),
    );

    const paid = coerceInvoiceAmountPaid(expense.invoiceAmountPaid ?? 0);
    const isInvoice = isInvoicePaymentType(expense.paymentType);
    const pendingAsync =
      isPendingAsyncPaymentType(expense.paymentType) &&
      !isSalePaidStatus(expense.status);

    const bulkSettledOnCreate =
      opts?.settleCollectedToPaymentType === true &&
      isSalePaidStatus(expense.status);
    const onCredit =
      isInvoice || (pendingAsync && !bulkSettledOnCreate);

    const paymentAsset = onCredit
      ? null
      : await resolvePaymentAssetAccount(
          userId,
          expense.paymentType,
          expense.settlementBankCode,
          db,
        );

    const bsKind = expenseBalanceSheetKind(expense);
    const debitAccount =
      bsKind === "fixed_asset"
        ? account(LEDGER_ACCOUNTS.FIXED_ASSET)
        : bsKind === "loan_repayment"
          ? account(LEDGER_ACCOUNTS.LOAN_LIABILITY)
          : bsKind === "tax_payment"
            ? account(LEDGER_ACCOUNTS.TAX_PAYABLE)
            : account(LEDGER_ACCOUNTS.EXPENSE);

    const debitAmount = bsKind ? total : netExpense;
    const vatDebit = !bsKind && inputVat > 0 ? inputVat : 0;

    const entries = onCredit
      ? [
          line(debitAccount, debitAmount, 0),
          ...(vatDebit > 0
            ? [line(account(LEDGER_ACCOUNTS.VAT_PAYABLE), vatDebit, 0)]
            : []),
          line(account(LEDGER_ACCOUNTS.ACCOUNTS_PAYABLE), 0, total),
        ]
      : [
          line(debitAccount, debitAmount, 0),
          ...(vatDebit > 0
            ? [line(account(LEDGER_ACCOUNTS.VAT_PAYABLE), vatDebit, 0)]
            : []),
          line(paymentAsset!, 0, total),
        ];

    const expenseNo = await expenseNumberLabel(expense.id, db);
    const tx = await postOnce(
      {
        userId,
        referenceType: LEDGER_REFERENCE_TYPES.EXPENSE_RECOGNITION,
        referenceId: expense.id,
        description: expenseRecognitionDescription(expenseNo),
        transactionDate: expense.expenseDate,
        entries,
      },
      db,
    );

    const postInvoiceCollections = opts?.postInvoiceCollections !== false;

    if (isInvoice && paid.items.length > 0 && postInvoiceCollections) {
      for (let i = 0; i < paid.items.length; i++) {
        const item = paid.items[i]!;
        if (item.amount <= 0) continue;
        await postOnce(
          {
            userId,
            referenceType: LEDGER_REFERENCE_TYPES.EXPENSE_PAYMENT,
            referenceId: `${expense.id}:inv:${i}`,
            description: expensePaymentDescription(expenseNo),
            transactionDate: expense.expenseDate,
            entries: [
              line(account(LEDGER_ACCOUNTS.ACCOUNTS_PAYABLE), item.amount, 0),
              line(
                await resolvePaymentAssetAccount(
                  userId,
                  item.paymentType,
                  item.bankCode ?? expense.settlementBankCode,
                  db,
                ),
                0,
                item.amount,
              ),
            ],
          },
          db,
        );
      }
    }

    return tx;
  },

  /** Pay supplier — AP ↓, Bank ↓ */
  async postExpensePayment(
    userId: string,
    expenseId: string,
    amount: number,
    paymentType: string,
    transactionDate: Date,
    suffix = "full",
    bankCode?: string | null,
    db: DbClient = prisma,
  ) {
    const amt = normalizeMoneyAmount(amount);
    if (amt <= 0) return null;

    const asset = await resolvePaymentAssetAccount(
      userId,
      paymentType,
      bankCode,
      db,
    );

    const expenseNo = await expenseNumberLabel(
      primaryReferenceId(expenseId),
      db,
    );
    return postOnce(
      {
        userId,
        referenceType: LEDGER_REFERENCE_TYPES.EXPENSE_PAYMENT,
        referenceId: `${expenseId}:${suffix}`,
        description: expensePaymentDescription(expenseNo),
        transactionDate,
        entries: [
          line(account(LEDGER_ACCOUNTS.ACCOUNTS_PAYABLE), amt, 0),
          line(asset, 0, amt),
        ],
      },
      db,
    );
  },

  /** Inbound payer receipt — credit depends on purpose (not always revenue). */
  async postPayerRecognition(
    userId: string,
    txn: {
      id: string;
      paymentType: string;
      amount: number;
      date: string;
      purpose?: string;
      incomeCategory?: string | null;
      vatAmount?: number;
      whtSuffered?: number;
    },
    db: DbClient = prisma,
  ) {
    const amount = normalizeMoneyAmount(txn.amount);
    if (amount <= 0) return null;

    const purpose = txn.purpose ?? "SALES";
    const vat = normalizeMoneyAmount(txn.vatAmount ?? 0);
    const wht = normalizeMoneyAmount(txn.whtSuffered ?? 0);
    const onCredit = txn.paymentType === "Invoice";
    const asset = onCredit
      ? account(LEDGER_ACCOUNTS.CUSTOMER_AR)
      : await resolvePaymentAssetAccount(userId, txn.paymentType, null, db);

    const netAsset = normalizeMoneyAmount(Math.max(0, amount - wht));
    const entries: LedgerEntryDraft[] = [];
    if (netAsset > 0) entries.push(line(asset, netAsset, 0));

    if (purpose === "LOAN_RECEIVED") {
      entries.push(line(account(LEDGER_ACCOUNTS.LOAN_LIABILITY), 0, amount));
    } else if (
      purpose === "OWNER_CAPITAL_INTRODUCED" ||
      purpose === "OTHER_RECEIPT"
    ) {
      entries.push(line(account(LEDGER_ACCOUNTS.OPENING_BALANCE), 0, amount));
    } else if (purpose === "EMPLOYEE_DIRECTOR_REPAYMENT") {
      entries.push(
        line(account(LEDGER_ACCOUNTS.EMPLOYEE_ADVANCE_RECEIVABLE), 0, amount),
      );
    } else if (purpose === "VENDOR_REFUND") {
      entries.push(
        line(account(LEDGER_ACCOUNTS.VENDOR_REFUND_RECEIVABLE), 0, amount),
      );
    } else if (purpose === "TAX_REFUND") {
      entries.push(
        line(account(LEDGER_ACCOUNTS.TAX_REFUND_RECEIVABLE), 0, amount),
      );
    } else if (purpose === "ASSET_SALE") {
      entries.push(line(account(LEDGER_ACCOUNTS.GAIN_ON_DISPOSAL), 0, amount));
    } else if (isPayerIncomePurpose(purpose)) {
      const income = payerIncomeAccount({
        purpose,
        incomeCategory: txn.incomeCategory,
      });
      const incomeAmount = normalizeMoneyAmount(Math.max(0, amount - vat));
      if (incomeAmount > 0) entries.push(line(account(income.code), 0, incomeAmount));
      if (vat > 0) {
        entries.push(line(account(LEDGER_ACCOUNTS.VAT_PAYABLE), 0, vat));
      }
      if (wht > 0) {
        if (isFinalWhtIncomeCategory(txn.incomeCategory)) {
          entries.push(line(account(LEDGER_ACCOUNTS.TAX_EXPENSE), wht, 0));
        } else {
          entries.push(line(account(LEDGER_ACCOUNTS.WHT_TAX_CREDIT), wht, 0));
        }
      }
    } else {
      entries.push(line(account(LEDGER_ACCOUNTS.OPENING_BALANCE), 0, amount));
    }

    const txDate = new Date(`${txn.date}T12:00:00.000Z`);

    return postOnce(
      {
        userId,
        referenceType: LEDGER_REFERENCE_TYPES.PAYER_RECOGNITION,
        referenceId: txn.id,
        description: `Payer ${purpose} ${txn.id}`,
        transactionDate: txDate,
        entries,
      },
      db,
    );
  },

  /** Customer payment on payer invoice — Bank ↑, AR ↓ */
  async postPayerCollection(
    userId: string,
    transactionId: string,
    amount: number,
    paymentType: string,
    transactionDate: Date,
    suffix: string,
    bankCode?: string | null,
    db: DbClient = prisma,
  ) {
    const amt = normalizeMoneyAmount(amount);
    if (amt <= 0) return null;

    const asset = await resolvePaymentAssetAccount(
      userId,
      paymentType,
      bankCode,
      db,
    );

    return postOnce(
      {
        userId,
        referenceType: LEDGER_REFERENCE_TYPES.PAYER_COLLECTION,
        referenceId: `${transactionId}:${suffix}`,
        description: `Payer collection ${transactionId}`,
        transactionDate,
        entries: [
          line(asset, amt, 0),
          line(account(LEDGER_ACCOUNTS.CUSTOMER_AR), 0, amt),
        ],
      },
      db,
    );
  },

  /** Beneficiary invoice — debit the party account, AP for the gross. WHT is not posted. */
  async postBeneficiaryInvoice(
    userId: string,
    txnId: string,
    grossAmount: number,
    date: string,
    debitAccountCode: string = LEDGER_ACCOUNTS.EXPENSE,
    db: DbClient = prisma,
  ) {
    const gross = normalizeMoneyAmount(grossAmount);
    if (gross <= 0) return null;

    return postOnce(
      {
        userId,
        referenceType: LEDGER_REFERENCE_TYPES.BENEFICIARY_INVOICE,
        referenceId: txnId,
        description: `Beneficiary invoice ${txnId}`,
        transactionDate: new Date(`${date}T12:00:00.000Z`),
        entries: [
          line(account(debitAccountCode), gross, 0),
          line(account(LEDGER_ACCOUNTS.ACCOUNTS_PAYABLE), 0, gross),
        ],
      },
      db,
    );
  },

  /**
   * Beneficiary payment — Dr Expense/AP, Cr Bank (net), Cr WHT Payable.
   * When linked to invoice, clears AP instead of expensing again.
   */
  async postBeneficiaryPayment(
    userId: string,
    txn: {
      id: string;
      grossAmount: number;
      netPayable: number;
      whtAmount: number;
      date: string;
      invoiceId?: string | null;
      debitAccountCode?: string;
    },
    db: DbClient = prisma,
  ) {
    const gross = normalizeMoneyAmount(txn.grossAmount);
    const net = normalizeMoneyAmount(txn.netPayable);
    const wht = normalizeMoneyAmount(txn.whtAmount);
    if (gross <= 0) return null;

    const entries: LedgerEntryDraft[] = [];
    if (txn.invoiceId) {
      entries.push(line(account(LEDGER_ACCOUNTS.ACCOUNTS_PAYABLE), gross, 0));
    } else {
      const debitCode = txn.debitAccountCode ?? LEDGER_ACCOUNTS.EXPENSE;
      entries.push(line(account(debitCode), gross, 0));
    }
    if (net > 0) {
      entries.push(line(account(LEDGER_ACCOUNTS.BANK), 0, net));
    }
    if (wht > 0) {
      entries.push(line(account(LEDGER_ACCOUNTS.WHT_PAYABLE), 0, wht));
    }

    return postOnce(
      {
        userId,
        referenceType: LEDGER_REFERENCE_TYPES.BENEFICIARY_PAYMENT,
        referenceId: txn.id,
        description: `Beneficiary payment ${txn.id}`,
        transactionDate: new Date(`${txn.date}T12:00:00.000Z`),
        entries,
      },
      db,
    );
  },

  /** WHT remitted — WHT Payable ↓, Bank ↓ */
  async postWhtRemitted(
    userId: string,
    transactionId: string,
    amount: number,
    remittedAt: Date,
    db: DbClient = prisma,
  ) {
    const amt = normalizeMoneyAmount(amount);
    if (amt <= 0) return null;

    return postOnce(
      {
        userId,
        referenceType: LEDGER_REFERENCE_TYPES.WHT_REMITTED,
        referenceId: transactionId,
        description: `WHT remittance ${transactionId}`,
        transactionDate: remittedAt,
        entries: [
          line(account(LEDGER_ACCOUNTS.WHT_PAYABLE), amt, 0),
          line(account(LEDGER_ACCOUNTS.BANK), 0, amt),
        ],
      },
      db,
    );
  },

  /** Loan principal paid — Liability ↓, Bank ↓ */
  async postLoanPrincipalPaid(
    userId: string,
    repaymentId: string,
    amount: number,
    paymentDate: Date,
    db: DbClient = prisma,
  ) {
    const amt = normalizeMoneyAmount(amount);
    if (amt <= 0) return null;

    return postOnce(
      {
        userId,
        referenceType: LEDGER_REFERENCE_TYPES.LOAN_PRINCIPAL_PAID,
        referenceId: repaymentId,
        description: `Loan principal repayment ${repaymentId}`,
        transactionDate: paymentDate,
        entries: [
          line(account(LEDGER_ACCOUNTS.LOAN_LIABILITY), amt, 0),
          line(account(LEDGER_ACCOUNTS.BANK), 0, amt),
        ],
      },
      db,
    );
  },

  /** Loan interest paid — Finance cost ↑, Bank ↓ */
  async postLoanInterestPaid(
    userId: string,
    repaymentId: string,
    amount: number,
    paymentDate: Date,
    db: DbClient = prisma,
  ) {
    const amt = normalizeMoneyAmount(amount);
    if (amt <= 0) return null;

    return postOnce(
      {
        userId,
        referenceType: LEDGER_REFERENCE_TYPES.LOAN_INTEREST_PAID,
        referenceId: `${repaymentId}:interest`,
        description: `Loan interest payment ${repaymentId}`,
        transactionDate: paymentDate,
        entries: [
          line(account(LEDGER_ACCOUNTS.FINANCE_COST), amt, 0),
          line(account(LEDGER_ACCOUNTS.BANK), 0, amt),
        ],
      },
      db,
    );
  },

  /** Asset purchase — Fixed asset ↑, Bank ↓ */
  async postAssetPurchase(
    userId: string,
    assetId: string,
    cost: number,
    purchaseDate: Date,
    db: DbClient = prisma,
  ) {
    const amt = normalizeMoneyAmount(cost);
    if (amt <= 0) return null;

    const row = await db.asset.findUnique({
      where: { id: assetId },
      select: { assetCode: true, assetName: true, assetType: true },
    });
    const label = row?.assetCode || row?.assetName || assetId;
    const assetCode = row?.assetType
      ? fixedAssetLedgerCode(row.assetType)
      : LEDGER_ACCOUNTS.FIXED_ASSET;
    return postOnce(
      {
        userId,
        referenceType: LEDGER_REFERENCE_TYPES.ASSET_PURCHASE,
        referenceId: assetId,
        description: `Asset purchase — ${label}`,
        transactionDate: purchaseDate,
        entries: [
          line(account(assetCode), amt, 0),
          line(account(LEDGER_ACCOUNTS.BANK), 0, amt),
        ],
      },
      db,
    );
  },

  /** Tax paid — Tax payable ↓, Bank ↓ */
  async postTaxPaid(
    userId: string,
    paymentRecordId: string,
    taxType: string,
    amount: number,
    paidAt: Date,
    db: DbClient = prisma,
  ) {
    const amt = normalizeMoneyAmount(amount);
    if (amt <= 0) return null;

    return postOnce(
      {
        userId,
        referenceType: LEDGER_REFERENCE_TYPES.TAX_PAID,
        referenceId: paymentRecordId,
        description: `${taxType} tax payment`,
        transactionDate: paidAt,
        entries: [
          line(account(LEDGER_ACCOUNTS.TAX_PAYABLE), amt, 0),
          line(account(LEDGER_ACCOUNTS.BANK), 0, amt),
        ],
      },
      db,
    );
  },

  /** Salary accrued — expense ↑, payables ↑ */
  async postSalaryAccrued(
    userId: string,
    obligationId: string,
    amounts: {
      salary: number;
      paye: number;
      pension: number;
      employerPension?: number;
      nhf?: number;
      netPay?: number;
      periodEnd: Date;
    },
    db: DbClient = prisma,
  ) {
    const salary = normalizeMoneyAmount(amounts.salary);
    const paye = normalizeMoneyAmount(amounts.paye);
    const pension = normalizeMoneyAmount(amounts.pension);
    const employerPension = normalizeMoneyAmount(amounts.employerPension ?? 0);
    const nhf = normalizeMoneyAmount(amounts.nhf ?? 0);
    const total = salary + employerPension;
    if (total <= 0) return null;

    const entries: LedgerEntryDraft[] = [
      line(account(LEDGER_ACCOUNTS.SALARY_EXPENSE), salary, 0),
    ];
    if (employerPension > 0) {
      entries.push(
        line(account(LEDGER_ACCOUNTS.EMPLOYER_PENSION_EXPENSE), employerPension, 0),
      );
    }
    const salaryNet = normalizeMoneyAmount(
      amounts.netPay != null
        ? amounts.netPay
        : salary - paye - Math.max(0, pension - employerPension) - nhf,
    );
    if (salaryNet > 0) {
      entries.push(
        line(account(LEDGER_ACCOUNTS.SALARY_PAYABLE), 0, salaryNet),
      );
    }
    if (paye > 0) {
      entries.push(line(account(LEDGER_ACCOUNTS.PAYE_PAYABLE), 0, paye));
    }
    if (pension > 0) {
      entries.push(line(account(LEDGER_ACCOUNTS.PENSION_PAYABLE), 0, pension));
    }
    if (nhf > 0) {
      entries.push(line(account(LEDGER_ACCOUNTS.NHF_PAYABLE), 0, nhf));
    }

    return postOnce(
      {
        userId,
        referenceType: LEDGER_REFERENCE_TYPES.SALARY_ACCRUED,
        referenceId: obligationId,
        description: `Payroll accrual ${obligationId}`,
        transactionDate: amounts.periodEnd,
        entries,
      },
      db,
    );
  },

  /** Payroll / statutory remittance — payable ↓, bank ↓ */
  async postPayrollRemittance(
    userId: string,
    obligationId: string,
    obligationType: string,
    amount: number,
    paidAt: Date,
    db: DbClient = prisma,
  ) {
    const amt = normalizeMoneyAmount(amount);
    if (amt <= 0) return null;

    const payableAccount =
      obligationType === "PAYE"
        ? account(LEDGER_ACCOUNTS.PAYE_PAYABLE)
        : obligationType === "PENSION"
          ? account(LEDGER_ACCOUNTS.PENSION_PAYABLE)
          : obligationType === "NHF"
            ? account(LEDGER_ACCOUNTS.NHF_PAYABLE)
            : account(LEDGER_ACCOUNTS.TAX_PAYABLE);

    return postOnce(
      {
        userId,
        referenceType: LEDGER_REFERENCE_TYPES.TAX_PAID,
        referenceId: `${obligationId}:${obligationType}`,
        description: `${obligationType} remittance`,
        transactionDate: paidAt,
        entries: [
          line(payableAccount, amt, 0),
          line(account(LEDGER_ACCOUNTS.BANK), 0, amt),
        ],
      },
      db,
    );
  },

  /** Asset sale — proceeds to bank, write off cost/accum. dep, gain or loss to P&L. */
  async postAssetSale(
    userId: string,
    saleId: string,
    input: {
      cost: number;
      accumulatedDepreciation: number;
      salePrice: number;
      saleDate: Date;
    },
    db: DbClient = prisma,
  ) {
    const cost = normalizeMoneyAmount(input.cost);
    const accum = normalizeMoneyAmount(input.accumulatedDepreciation);
    const proceeds = normalizeMoneyAmount(input.salePrice);
    const bookValue = normalizeMoneyAmount(Math.max(0, cost - accum));
    const gain = normalizeMoneyAmount(Math.max(0, proceeds - bookValue));
    const loss = normalizeMoneyAmount(Math.max(0, bookValue - proceeds));
    if (cost <= 0 && proceeds <= 0 && accum <= 0) return null;

    const entries: LedgerEntryDraft[] = [];
    if (proceeds > 0) {
      entries.push(line(account(LEDGER_ACCOUNTS.BANK), proceeds, 0));
    }
    if (accum > 0) {
      entries.push(
        line(account(LEDGER_ACCOUNTS.ACCUMULATED_DEPRECIATION), accum, 0),
      );
    }
    if (loss > 0) {
      entries.push(line(account(LEDGER_ACCOUNTS.LOSS_ON_DISPOSAL), loss, 0));
    }
    if (cost > 0) {
      entries.push(line(account(LEDGER_ACCOUNTS.FIXED_ASSET), 0, cost));
    }
    if (gain > 0) {
      entries.push(line(account(LEDGER_ACCOUNTS.GAIN_ON_DISPOSAL), 0, gain));
    }
    if (entries.length < 2) return null;

    return postOnce(
      {
        userId,
        referenceType: LEDGER_REFERENCE_TYPES.ASSET_SALE,
        referenceId: saleId,
        description: `Asset sale ${saleId}`,
        transactionDate: input.saleDate,
        entries,
      },
      db,
    );
  },

  /** Asset write-off — remove cost and accum. dep; remaining NBV is loss. */
  async postAssetDisposal(
    userId: string,
    disposalId: string,
    input: {
      cost: number;
      accumulatedDepreciation: number;
      disposalDate: Date;
    },
    db: DbClient = prisma,
  ) {
    const cost = normalizeMoneyAmount(input.cost);
    const accum = normalizeMoneyAmount(input.accumulatedDepreciation);
    const bookValue = normalizeMoneyAmount(Math.max(0, cost - accum));
    if (cost <= 0) return null;

    const entries: LedgerEntryDraft[] = [];
    if (accum > 0) {
      entries.push(
        line(account(LEDGER_ACCOUNTS.ACCUMULATED_DEPRECIATION), accum, 0),
      );
    }
    if (bookValue > 0) {
      entries.push(
        line(account(LEDGER_ACCOUNTS.LOSS_ON_DISPOSAL), bookValue, 0),
      );
    }
    entries.push(line(account(LEDGER_ACCOUNTS.FIXED_ASSET), 0, cost));

    return postOnce(
      {
        userId,
        referenceType: LEDGER_REFERENCE_TYPES.ASSET_DISPOSAL,
        referenceId: disposalId,
        description: `Asset disposal ${disposalId}`,
        transactionDate: input.disposalDate,
        entries,
      },
      db,
    );
  },

  /** Units-of-production charge for a recorded period. */
  async postUnitOfProductionDepreciation(
    userId: string,
    recordId: string,
    amount: number,
    periodEnd: Date,
    db: DbClient = prisma,
  ) {
    const amt = normalizeMoneyAmount(amount);
    if (amt <= 0) return null;

    return postOnce(
      {
        userId,
        referenceType: LEDGER_REFERENCE_TYPES.DEPRECIATION,
        referenceId: recordId,
        description: `Units-of-production depreciation ${recordId}`,
        transactionDate: periodEnd,
        entries: [
          line(account(LEDGER_ACCOUNTS.DEPRECIATION_EXPENSE), amt, 0),
          line(account(LEDGER_ACCOUNTS.ACCUMULATED_DEPRECIATION), 0, amt),
        ],
      },
      db,
    );
  },

  /** Loan proceeds — Bank ↑, loan liability ↑. Not revenue. */
  async postLoanReceived(
    userId: string,
    liabilityId: string,
    amount: number,
    receivedDate: Date,
    db: DbClient = prisma,
  ) {
    const amt = normalizeMoneyAmount(amount);
    if (amt <= 0) return null;
    return postOnce(
      {
        userId,
        referenceType: LEDGER_REFERENCE_TYPES.LOAN_RECEIVED,
        referenceId: liabilityId,
        description: `Loan received ${liabilityId}`,
        transactionDate: receivedDate,
        entries: [
          line(account(LEDGER_ACCOUNTS.BANK), amt, 0),
          line(account(LEDGER_ACCOUNTS.LOAN_LIABILITY), 0, amt),
        ],
      },
      db,
    );
  },

  async postInventoryOpening(
    userId: string,
    itemId: string,
    amount: number,
    transactionDate: Date,
    db: DbClient = prisma,
  ) {
    const amt = normalizeMoneyAmount(amount);
    if (amt <= 0) return null;
    return postOnce(
      {
        userId,
        referenceType: LEDGER_REFERENCE_TYPES.INVENTORY_OPENING,
        referenceId: itemId,
        description: `Opening inventory ${itemId}`,
        transactionDate,
        entries: [
          line(account(LEDGER_ACCOUNTS.INVENTORY), amt, 0),
          line(account(LEDGER_ACCOUNTS.OPENING_BALANCE), 0, amt),
        ],
      },
      db,
    );
  },

  async postInventoryStockIn(
    userId: string,
    movementId: string,
    amount: number,
    transactionDate: Date,
    paid: boolean,
    db: DbClient = prisma,
  ) {
    const amt = normalizeMoneyAmount(amount);
    if (amt <= 0) return null;
    return postOnce(
      {
        userId,
        referenceType: LEDGER_REFERENCE_TYPES.INVENTORY_STOCK_IN,
        referenceId: movementId,
        description: `Inventory stock in ${movementId}`,
        transactionDate,
        entries: [
          line(account(LEDGER_ACCOUNTS.INVENTORY), amt, 0),
          line(
            paid
              ? account(LEDGER_ACCOUNTS.BANK)
              : account(LEDGER_ACCOUNTS.ACCOUNTS_PAYABLE),
            0,
            amt,
          ),
        ],
      },
      db,
    );
  },

  async postInventoryStockOut(
    userId: string,
    movementId: string,
    amount: number,
    transactionDate: Date,
    db: DbClient = prisma,
  ) {
    const amt = normalizeMoneyAmount(amount);
    if (amt <= 0) return null;
    return postOnce(
      {
        userId,
        referenceType: LEDGER_REFERENCE_TYPES.INVENTORY_STOCK_OUT,
        referenceId: movementId,
        description: `Inventory write-off ${movementId}`,
        transactionDate,
        entries: [
          line(account(LEDGER_ACCOUNTS.INVENTORY_LOSS), amt, 0),
          line(account(LEDGER_ACCOUNTS.INVENTORY), 0, amt),
        ],
      },
      db,
    );
  },

  async postInventoryCogs(
    userId: string,
    saleId: string,
    amount: number,
    transactionDate: Date,
    db: DbClient = prisma,
  ) {
    const amt = normalizeMoneyAmount(amount);
    if (amt <= 0) return null;
    return postOnce(
      {
        userId,
        referenceType: LEDGER_REFERENCE_TYPES.INVENTORY_COGS,
        referenceId: saleId,
        description: `Cost of goods sold ${saleId}`,
        transactionDate,
        entries: [
          line(account(LEDGER_ACCOUNTS.COGS), amt, 0),
          line(account(LEDGER_ACCOUNTS.INVENTORY), 0, amt),
        ],
      },
      db,
    );
  },

  async postPrepaymentPaid(
    userId: string,
    prepaymentId: string,
    amount: number,
    paymentDate: Date,
    db: DbClient = prisma,
  ) {
    const amt = normalizeMoneyAmount(amount);
    if (amt <= 0) return null;
    return postOnce(
      {
        userId,
        referenceType: LEDGER_REFERENCE_TYPES.PREPAYMENT_PAID,
        referenceId: prepaymentId,
        description: `Prepayment ${prepaymentId}`,
        transactionDate: paymentDate,
        entries: [
          line(account(LEDGER_ACCOUNTS.PREPAYMENTS), amt, 0),
          line(account(LEDGER_ACCOUNTS.BANK), 0, amt),
        ],
      },
      db,
    );
  },

  async postPrepaymentRecognition(
    userId: string,
    scheduleItemId: string,
    amount: number,
    recognitionDate: Date,
    expenseAccountCode: string = LEDGER_ACCOUNTS.EXPENSE,
    db: DbClient = prisma,
  ) {
    const amt = normalizeMoneyAmount(amount);
    if (amt <= 0) return null;
    return postOnce(
      {
        userId,
        referenceType: LEDGER_REFERENCE_TYPES.PREPAYMENT_RECOGNITION,
        referenceId: scheduleItemId,
        description: `Prepayment recognition ${scheduleItemId}`,
        transactionDate: recognitionDate,
        entries: [
          line(account(expenseAccountCode), amt, 0),
          line(account(LEDGER_ACCOUNTS.PREPAYMENTS), 0, amt),
        ],
      },
      db,
    );
  },

  async postPrepaymentCancel(
    userId: string,
    prepaymentId: string,
    remaining: number,
    cancelDate: Date,
    refunded: boolean,
    db: DbClient = prisma,
  ) {
    const amt = normalizeMoneyAmount(remaining);
    if (amt <= 0) return null;
    return postOnce(
      {
        userId,
        referenceType: LEDGER_REFERENCE_TYPES.PREPAYMENT_CANCEL,
        referenceId: prepaymentId,
        description: `Prepayment cancel ${prepaymentId}`,
        transactionDate: cancelDate,
        entries: refunded
          ? [
              line(account(LEDGER_ACCOUNTS.BANK), amt, 0),
              line(account(LEDGER_ACCOUNTS.PREPAYMENTS), 0, amt),
            ]
          : [
              line(account(LEDGER_ACCOUNTS.EXPENSE), amt, 0),
              line(account(LEDGER_ACCOUNTS.PREPAYMENTS), 0, amt),
            ],
      },
      db,
    );
  },
};
