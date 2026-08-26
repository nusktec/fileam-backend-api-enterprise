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
import {
  isCashPaymentType,
  isInvoicePaymentType,
  isPendingAsyncPaymentType,
  isSalePaidStatus,
} from "../constants/salePaymentRules";
import { coerceInvoiceAmountPaid } from "../constants/invoiceAmountPaid";
import { ledgerService } from "./ledgerService";
import { normalizeMoneyAmount } from "../utils/monetaryAmount";

type DbClient = Prisma.TransactionClient | typeof prisma;

function account(code: string, name?: string): { code: string; name: string } {
  return { code, name: name ?? LEDGER_ACCOUNT_NAMES[code] ?? code };
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

function cashOrBank(paymentType: string): { code: string; name: string } {
  return isCashPaymentType(paymentType)
    ? account(LEDGER_ACCOUNTS.CASH_ON_HAND)
    : account(LEDGER_ACCOUNTS.BANK);
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
  totalAmount: number;
  collectedAmount: number;
  isCredit: boolean;
}): LedgerEntryDraft[] {
  const net = normalizeMoneyAmount(input.netRevenue);
  const vat = normalizeMoneyAmount(input.vatAmount);
  const total = normalizeMoneyAmount(input.totalAmount);
  const collected = normalizeMoneyAmount(input.collectedAmount);
  const ar = normalizeMoneyAmount(Math.max(0, total - collected));

  const entries: LedgerEntryDraft[] = [];

  if (collected > 0) {
    entries.push(
      line(cashOrBank("Cash"), collected, 0),
    );
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
  /** Cash sale or credit sale (+ VAT split). Revenue excludes VAT. */
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
    },
    db: DbClient = prisma,
  ) {
    const netRevenue = Number(sale.amount);
    const vatAmount = sale.vatAmount != null ? Number(sale.vatAmount) : 0;
    const totalAmount = Number(sale.totalAmount);
    const paid = coerceInvoiceAmountPaid(sale.invoiceAmountPaid ?? 0);

    const isCredit =
      isInvoicePaymentType(sale.paymentType) ||
      (isPendingAsyncPaymentType(sale.paymentType) &&
        !isSalePaidStatus(sale.status));

    let collected = 0;
    if (!isCredit) {
      collected = totalAmount;
    } else if (paid.total > 0) {
      collected = paid.total;
    }

    const entries = saleRecognitionEntries({
      netRevenue,
      vatAmount,
      totalAmount,
      collectedAmount: collected,
      isCredit,
    });
    if (entries.length === 0 || totalAmount <= 0) return null;

    return postOnce(
      {
        userId,
        referenceType: LEDGER_REFERENCE_TYPES.SALE_RECOGNITION,
        referenceId: sale.id,
        description: `Sale recognition ${sale.id}`,
        transactionDate: sale.saleDate,
        entries,
      },
      db,
    );
  },

  /** Customer payment clearing AR (invoice settlement or async confirm). */
  async postSaleCollection(
    userId: string,
    saleId: string,
    amount: number,
    paymentType: string,
    transactionDate: Date,
    suffix = "full",
    db: DbClient = prisma,
  ) {
    const amt = normalizeMoneyAmount(amount);
    if (amt <= 0) return null;

    return postOnce(
      {
        userId,
        referenceType: LEDGER_REFERENCE_TYPES.SALE_COLLECTION,
        referenceId: `${saleId}:${suffix}`,
        description: `Sale collection ${saleId}`,
        transactionDate,
        entries: [
          line(cashOrBank(paymentType), amt, 0),
          line(account(LEDGER_ACCOUNTS.CUSTOMER_AR), 0, amt),
        ],
      },
      db,
    );
  },

  /** Expense paid (Dr Expense, Cr Bank) or on credit (Dr Expense, Cr AP). */
  async postExpenseRecognition(
    userId: string,
    expense: {
      id: string;
      paymentType: string;
      status: string;
      totalAmount: number | { toNumber?: () => number };
      expenseDate: Date;
    },
    db: DbClient = prisma,
  ) {
    const total = normalizeMoneyAmount(Number(expense.totalAmount));
    if (total <= 0) return null;

    const onCredit =
      isInvoicePaymentType(expense.paymentType) ||
      (isPendingAsyncPaymentType(expense.paymentType) &&
        !isSalePaidStatus(expense.status));

    const entries = onCredit
      ? [
          line(account(LEDGER_ACCOUNTS.EXPENSE), total, 0),
          line(account(LEDGER_ACCOUNTS.ACCOUNTS_PAYABLE), 0, total),
        ]
      : [
          line(account(LEDGER_ACCOUNTS.EXPENSE), total, 0),
          line(cashOrBank(expense.paymentType), 0, total),
        ];

    return postOnce(
      {
        userId,
        referenceType: LEDGER_REFERENCE_TYPES.EXPENSE_RECOGNITION,
        referenceId: expense.id,
        description: `Expense recognition ${expense.id}`,
        transactionDate: expense.expenseDate,
        entries,
      },
      db,
    );
  },

  /** Pay supplier — AP ↓, Bank ↓ */
  async postExpensePayment(
    userId: string,
    expenseId: string,
    amount: number,
    paymentType: string,
    transactionDate: Date,
    suffix = "full",
    db: DbClient = prisma,
  ) {
    const amt = normalizeMoneyAmount(amount);
    if (amt <= 0) return null;

    return postOnce(
      {
        userId,
        referenceType: LEDGER_REFERENCE_TYPES.EXPENSE_PAYMENT,
        referenceId: `${expenseId}:${suffix}`,
        description: `Expense payment ${expenseId}`,
        transactionDate,
        entries: [
          line(account(LEDGER_ACCOUNTS.ACCOUNTS_PAYABLE), amt, 0),
          line(cashOrBank(paymentType), 0, amt),
        ],
      },
      db,
    );
  },

  /** Inbound payer fee — cash or credit (mirrors sales). */
  async postPayerRecognition(
    userId: string,
    txn: {
      id: string;
      paymentType: string;
      amount: number;
      date: string;
    },
    db: DbClient = prisma,
  ) {
    const amount = normalizeMoneyAmount(txn.amount);
    if (amount <= 0) return null;

    const onCredit = txn.paymentType === "Invoice";
    const entries = onCredit
      ? [
          line(account(LEDGER_ACCOUNTS.CUSTOMER_AR), amount, 0),
          line(account(LEDGER_ACCOUNTS.SALES_REVENUE), 0, amount),
        ]
      : [
          line(cashOrBank(txn.paymentType), amount, 0),
          line(account(LEDGER_ACCOUNTS.SALES_REVENUE), 0, amount),
        ];

    const txDate = new Date(`${txn.date}T12:00:00.000Z`);

    return postOnce(
      {
        userId,
        referenceType: LEDGER_REFERENCE_TYPES.PAYER_RECOGNITION,
        referenceId: txn.id,
        description: `Payer income ${txn.id}`,
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
    db: DbClient = prisma,
  ) {
    const amt = normalizeMoneyAmount(amount);
    if (amt <= 0) return null;

    return postOnce(
      {
        userId,
        referenceType: LEDGER_REFERENCE_TYPES.PAYER_COLLECTION,
        referenceId: `${transactionId}:${suffix}`,
        description: `Payer collection ${transactionId}`,
        transactionDate,
        entries: [
          line(cashOrBank(paymentType), amt, 0),
          line(account(LEDGER_ACCOUNTS.CUSTOMER_AR), 0, amt),
        ],
      },
      db,
    );
  },

  /** Beneficiary invoice — expense on credit */
  async postBeneficiaryInvoice(
    userId: string,
    txnId: string,
    grossAmount: number,
    date: string,
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
          line(account(LEDGER_ACCOUNTS.EXPENSE), gross, 0),
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
      entries.push(line(account(LEDGER_ACCOUNTS.EXPENSE), gross, 0));
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

    return postOnce(
      {
        userId,
        referenceType: LEDGER_REFERENCE_TYPES.ASSET_PURCHASE,
        referenceId: assetId,
        description: `Asset purchase ${assetId}`,
        transactionDate: purchaseDate,
        entries: [
          line(account(LEDGER_ACCOUNTS.FIXED_ASSET), amt, 0),
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
      periodEnd: Date;
    },
    db: DbClient = prisma,
  ) {
    const salary = normalizeMoneyAmount(amounts.salary);
    const paye = normalizeMoneyAmount(amounts.paye);
    const pension = normalizeMoneyAmount(amounts.pension);
    const total = salary + paye + pension;
    if (total <= 0) return null;

    const entries: LedgerEntryDraft[] = [
      line(account(LEDGER_ACCOUNTS.SALARY_EXPENSE), salary, 0),
    ];
    const salaryNet = normalizeMoneyAmount(salary - paye - pension);
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
};
