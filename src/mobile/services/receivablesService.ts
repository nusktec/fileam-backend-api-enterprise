import { Decimal } from "@prisma/client/runtime/library";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { ASSET_STATUS } from "../../constants/assets";
import {
  LEDGER_ACCOUNTS,
  LEDGER_REFERENCE_TYPES,
} from "../../constants/ledger";
import {
  RECEIVABLE_TYPES,
  settlementStatus,
  type ReceivableType,
} from "../../constants/receivables";
import { ledgerService } from "../../services/ledgerService";
import { nextDisplayCode } from "../../utils/codeGenerator";
import { HttpReplyError } from "../../utils/httpReplyError";
import { normalizeMoneyAmount } from "../../utils/monetaryAmount";

const RECEIVABLE_COUNTER = "receivable_code";

function d(v: Decimal | number | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === "object" && typeof v.toNumber === "function") {
    return v.toNumber();
  }
  return Number(v);
}

function dec(n: number): Decimal {
  return new Decimal(normalizeMoneyAmount(n));
}

function parseDateOnly(value: string, field = "date"): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) throw new HttpReplyError(400, `${field} must be YYYY-MM-DD`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function formatYmd(date: Date | null | undefined): string | null {
  if (!date) return null;
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type ReceivableRow = {
  id: string;
  receivableCode: string;
  type: string;
  status: string;
  partyName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  assetId: string | null;
  employeeId: string | null;
  grossAmount: Decimal;
  amountReceived: Decimal;
  outstandingAmount: Decimal;
  dueDate: Date | null;
  payload: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
};

function payloadObject(payload: Prisma.JsonValue): Record<string, unknown> {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  return {};
}

function formatDetail(row: ReceivableRow) {
  const base = {
    id: row.receivableCode,
    type: row.type,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  const payload = payloadObject(row.payload);

  switch (row.type as ReceivableType) {
    case RECEIVABLE_TYPES.FIXED_ASSET_SALE_ON_CREDIT:
      return {
        ...base,
        assetId: row.assetId,
        partyName: row.partyName,
        phone: payload.phone ?? null,
        address: payload.address ?? null,
        email: payload.email ?? null,
        salePrice: d(row.grossAmount),
        amountReceived: d(row.amountReceived),
        outstandingReceivable: d(row.outstandingAmount),
        paymentDueDate: formatYmd(row.dueDate),
        notes: payload.notes ?? null,
      };
    case RECEIVABLE_TYPES.SUPPLIER_REFUND_OVERPAYMENT:
      return {
        ...base,
        supplierId: row.supplierId,
        supplierName: row.supplierName,
        reason: payload.reason ?? null,
        originalInvoiceAmount: payload.originalInvoiceAmount ?? null,
        amountPaid: payload.amountPaid ?? null,
        refundAmountExpected: d(row.grossAmount),
        amountAlreadyRefunded: d(row.amountReceived),
        outstandingRefundReceivable: d(row.outstandingAmount),
        expectedRefundDate: formatYmd(row.dueDate),
        refundMethod: payload.refundMethod ?? null,
        notes: payload.notes ?? null,
      };
    case RECEIVABLE_TYPES.EMPLOYEE_DIRECTOR_ADVANCE:
      return {
        ...base,
        recipientType: payload.recipientType ?? null,
        employeeId: row.employeeId,
        recipientName: payload.recipientName ?? row.partyName,
        advanceType: payload.advanceType ?? null,
        amountAdvanced: d(row.grossAmount),
        amountRepaid: d(row.amountReceived),
        outstandingReceivable: d(row.outstandingAmount),
        dateAdvanced: payload.dateAdvanced ?? null,
        expectedSettlementDate: formatYmd(row.dueDate),
        repaymentMethod: payload.repaymentMethod ?? null,
        repaymentSchedule: payload.repaymentSchedule ?? null,
        purpose: payload.purpose ?? null,
      };
    case RECEIVABLE_TYPES.TAX_REFUND_VAT_CREDIT:
      return {
        ...base,
        taxAuthority: payload.taxAuthority ?? null,
        taxType: payload.taxType ?? null,
        taxPeriod: payload.taxPeriod ?? null,
        filingReference: payload.filingReference ?? null,
        reason: payload.reason ?? null,
        refundCreditAmount: d(row.grossAmount),
        amountAlreadyReceived: d(row.amountReceived),
        outstandingTaxReceivable: d(row.outstandingAmount),
        expectedRefundDate: formatYmd(row.dueDate),
        evidenceUrl: payload.evidenceUrl ?? null,
      };
    case RECEIVABLE_TYPES.INVESTMENT_INCOME_OWED: {
      const whtDeducted = Number(payload.whtDeducted ?? 0);
      const incomeAmount = d(row.grossAmount);
      return {
        ...base,
        investmentName: payload.investmentName ?? null,
        investmentType: payload.investmentType ?? null,
        investmentAccountReference: payload.investmentAccountReference ?? null,
        incomeType: payload.incomeType ?? null,
        principalAmount: payload.principalAmount ?? null,
        incomeAmount,
        incomeAccrualDate: payload.incomeAccrualDate ?? null,
        paymentDueDate: formatYmd(row.dueDate),
        payerEntity: payload.payerEntity ?? null,
        referenceNumber: payload.referenceNumber ?? null,
        amountReceived: d(row.amountReceived),
        outstandingIncomeReceivable: d(row.outstandingAmount),
        whtDeducted,
        whtCreditNoteAvailable: payload.whtCreditNoteAvailable ?? false,
        netAmountExpected: normalizeMoneyAmount(incomeAmount - whtDeducted),
      };
    }
    default:
      return base;
  }
}

function formatListItem(row: ReceivableRow) {
  const item: Record<string, unknown> = {
    id: row.receivableCode,
    type: row.type,
    amount: d(row.grossAmount),
    amountReceived: d(row.amountReceived),
    outstandingAmount: d(row.outstandingAmount),
    dueDate: formatYmd(row.dueDate),
    status: row.status,
  };

  if (row.partyName) item.partyName = row.partyName;
  if (row.supplierId) item.supplierId = row.supplierId;
  if (row.supplierName) item.supplierName = row.supplierName;

  return item;
}

async function postReceivableLedger(
  userId: string,
  receivableId: string,
  receivableCode: string,
  type: ReceivableType,
  grossAmount: number,
  amountReceived: number,
  transactionDate: Date,
  db: Parameters<typeof ledgerService.post>[1] = prisma,
) {
  let debitAccount: { code: string; name: string } = {
    code: LEDGER_ACCOUNTS.ASSET_SALE_RECEIVABLE,
    name: "Asset Sale Receivable",
  };
  let creditAccount: { code: string; name: string } = {
    code: LEDGER_ACCOUNTS.ASSET_SALE_PROCEEDS,
    name: "Asset Sale Proceeds",
  };

  switch (type) {
    case RECEIVABLE_TYPES.SUPPLIER_REFUND_OVERPAYMENT:
      debitAccount = {
        code: LEDGER_ACCOUNTS.VENDOR_REFUND_RECEIVABLE,
        name: "Vendor Refund Receivable",
      };
      creditAccount = {
        code: LEDGER_ACCOUNTS.EXPENSE,
        name: "Expense / Inventory Offset",
      };
      break;
    case RECEIVABLE_TYPES.EMPLOYEE_DIRECTOR_ADVANCE:
      debitAccount = {
        code: LEDGER_ACCOUNTS.EMPLOYEE_ADVANCE_RECEIVABLE,
        name: "Employee/Director Advance Receivable",
      };
      creditAccount = {
        code: LEDGER_ACCOUNTS.BANK,
        name: "Bank/Cash",
      };
      break;
    case RECEIVABLE_TYPES.TAX_REFUND_VAT_CREDIT:
      debitAccount = {
        code: LEDGER_ACCOUNTS.TAX_REFUND_RECEIVABLE,
        name: "Tax Refund Receivable",
      };
      creditAccount = {
        code: LEDGER_ACCOUNTS.OTHER_EQUITY,
        name: "Tax Expense / Tax Account",
      };
      break;
    case RECEIVABLE_TYPES.INVESTMENT_INCOME_OWED:
      debitAccount = {
        code: LEDGER_ACCOUNTS.INVESTMENT_INCOME_RECEIVABLE,
        name: "Investment Income Receivable",
      };
      creditAccount = {
        code: LEDGER_ACCOUNTS.INVESTMENT_INCOME,
        name: "Investment Income",
      };
      break;
    default:
      break;
  }

  if (grossAmount <= 0) return;

  const entries = [
    {
      accountCode: debitAccount.code,
      accountName: debitAccount.name,
      debit: grossAmount,
      credit: 0,
    },
    {
      accountCode: creditAccount.code,
      accountName: creditAccount.name,
      debit: 0,
      credit: grossAmount,
    },
  ];

  if (amountReceived > 0) {
    entries.push(
      {
        accountCode: LEDGER_ACCOUNTS.CASH_ON_HAND,
        accountName: "Bank/Cash",
        debit: amountReceived,
        credit: 0,
      },
      {
        accountCode: debitAccount.code,
        accountName: debitAccount.name,
        debit: 0,
        credit: amountReceived,
      },
    );
  }

  await ledgerService.post(
    {
      userId,
      referenceType: LEDGER_REFERENCE_TYPES.RECEIVABLE,
      referenceId: receivableId,
      description: `Receivable recognition ${receivableCode}`,
      transactionDate,
      entries,
    },
    db,
  );
}

async function createReceivable(
  userId: string,
  type: ReceivableType,
  data: {
    grossAmount: number;
    amountReceived: number;
    status: string;
    dueDate?: Date | null;
    partyName?: string | null;
    supplierId?: string | null;
    supplierName?: string | null;
    assetId?: string | null;
    employeeId?: string | null;
    payload: Record<string, unknown>;
    ledgerDate: Date;
  },
) {
  const grossAmount = normalizeMoneyAmount(data.grossAmount);
  const amountReceived = normalizeMoneyAmount(data.amountReceived);
  const outstandingAmount = normalizeMoneyAmount(
    Math.max(0, grossAmount - amountReceived),
  );

  const receivableCode = await nextDisplayCode(RECEIVABLE_COUNTER, "REC");

  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.receivable.create({
      data: {
        userId,
        receivableCode,
        type,
        status: data.status,
        partyName: data.partyName?.trim() || null,
        supplierId: data.supplierId ?? null,
        supplierName: data.supplierName?.trim() || null,
        assetId: data.assetId ?? null,
        employeeId: data.employeeId ?? null,
        grossAmount: dec(grossAmount),
        amountReceived: dec(amountReceived),
        outstandingAmount: dec(outstandingAmount),
        dueDate: data.dueDate ?? null,
        payload: data.payload as Prisma.InputJsonValue,
      },
    });

    await postReceivableLedger(
      userId,
      created.id,
      receivableCode,
      type,
      grossAmount,
      amountReceived,
      data.ledgerDate,
      tx,
    );

    return created;
  });

  return formatDetail(row);
}

export const receivablesService = {
  async createFixedAssetSale(
    userId: string,
    input: {
      assetId: string;
      partyName: string;
      phone: string;
      address: string;
      salePrice: number;
      paymentDueDate: string;
      email?: string;
      amountReceived?: number;
      notes?: string;
    },
  ) {
    const asset = await prisma.asset.findFirst({
      where: { id: input.assetId, userId },
    });
    if (!asset) throw new HttpReplyError(404, "Asset not found");
    if (
      asset.status === ASSET_STATUS.SOLD ||
      asset.status === ASSET_STATUS.DISPOSED
    ) {
      throw new HttpReplyError(
        400,
        "Cannot create receivable for sold or disposed asset",
      );
    }

    const salePrice = normalizeMoneyAmount(input.salePrice);
    const amountReceived = normalizeMoneyAmount(input.amountReceived ?? 0);
    if (amountReceived > salePrice) {
      throw new HttpReplyError(
        400,
        "amountReceived cannot exceed salePrice",
      );
    }

    return createReceivable(userId, RECEIVABLE_TYPES.FIXED_ASSET_SALE_ON_CREDIT, {
      grossAmount: salePrice,
      amountReceived,
      status: settlementStatus(salePrice, amountReceived),
      dueDate: parseDateOnly(input.paymentDueDate, "paymentDueDate"),
      partyName: input.partyName,
      assetId: input.assetId,
      payload: {
        phone: input.phone.trim(),
        address: input.address.trim(),
        email: input.email?.trim() || null,
        notes: input.notes?.trim() || null,
      },
      ledgerDate: parseDateOnly(input.paymentDueDate, "paymentDueDate"),
    });
  },

  async createSupplierRefund(
    userId: string,
    input: {
      supplierId: string;
      reason: string;
      originalInvoiceAmount: number;
      amountPaid: number;
      refundAmountExpected: number;
      expectedRefundDate: string;
      refundMethod: string;
      amountAlreadyRefunded?: number;
      notes?: string;
    },
  ) {
    const supplier = await prisma.supplier.findFirst({
      where: { id: input.supplierId, userId },
    });
    if (!supplier) throw new HttpReplyError(404, "Supplier not found");

    const refundAmountExpected = normalizeMoneyAmount(
      input.refundAmountExpected,
    );
    const amountAlreadyRefunded = normalizeMoneyAmount(
      input.amountAlreadyRefunded ?? 0,
    );
    if (amountAlreadyRefunded > refundAmountExpected) {
      throw new HttpReplyError(
        400,
        "amountAlreadyRefunded cannot exceed refundAmountExpected",
      );
    }

    return createReceivable(
      userId,
      RECEIVABLE_TYPES.SUPPLIER_REFUND_OVERPAYMENT,
      {
        grossAmount: refundAmountExpected,
        amountReceived: amountAlreadyRefunded,
        status: settlementStatus(refundAmountExpected, amountAlreadyRefunded),
        dueDate: parseDateOnly(input.expectedRefundDate, "expectedRefundDate"),
        supplierId: input.supplierId,
        supplierName: supplier.name,
        payload: {
          reason: input.reason,
          originalInvoiceAmount: normalizeMoneyAmount(
            input.originalInvoiceAmount,
          ),
          amountPaid: normalizeMoneyAmount(input.amountPaid),
          refundMethod: input.refundMethod,
          notes: input.notes?.trim() || null,
        },
        ledgerDate: parseDateOnly(input.expectedRefundDate, "expectedRefundDate"),
      },
    );
  },

  async createEmployeeDirectorAdvance(
    userId: string,
    input: {
      recipientType: string;
      employeeId?: string;
      recipientName?: string;
      advanceType: string;
      amountAdvanced: number;
      dateAdvanced: string;
      expectedSettlementDate: string;
      repaymentMethod: string;
      repaymentSchedule: string;
      purpose: string;
    },
  ) {
    let recipientName = input.recipientName?.trim() || null;
    let employeeId: string | null = null;

    if (input.recipientType === "EMPLOYEE") {
      if (!input.employeeId) {
        throw new HttpReplyError(400, "employeeId is required for EMPLOYEE");
      }
      const employee = await prisma.employee.findFirst({
        where: { id: input.employeeId, userId },
      });
      if (!employee) throw new HttpReplyError(404, "Employee not found");
      employeeId = employee.id;
      recipientName = employee.fullName.trim();
    } else if (!recipientName) {
      throw new HttpReplyError(400, "recipientName is required");
    }

    const amountAdvanced = normalizeMoneyAmount(input.amountAdvanced);

    return createReceivable(
      userId,
      RECEIVABLE_TYPES.EMPLOYEE_DIRECTOR_ADVANCE,
      {
        grossAmount: amountAdvanced,
        amountReceived: 0,
        status: "PENDING",
        dueDate: parseDateOnly(
          input.expectedSettlementDate,
          "expectedSettlementDate",
        ),
        partyName: recipientName,
        employeeId,
        payload: {
          recipientType: input.recipientType,
          recipientName,
          advanceType: input.advanceType,
          dateAdvanced: input.dateAdvanced,
          repaymentMethod: input.repaymentMethod,
          repaymentSchedule: input.repaymentSchedule,
          purpose: input.purpose.trim(),
        },
        ledgerDate: parseDateOnly(input.dateAdvanced, "dateAdvanced"),
      },
    );
  },

  async createTaxRefund(
    userId: string,
    input: {
      taxAuthority: string;
      taxType: string;
      taxPeriod: string;
      filingReference: string;
      reason: string;
      refundCreditAmount: number;
      expectedRefundDate: string;
      status: string;
      evidenceUrl?: string;
      amountAlreadyReceived?: number;
    },
  ) {
    const refundCreditAmount = normalizeMoneyAmount(input.refundCreditAmount);
    const amountAlreadyReceived = normalizeMoneyAmount(
      input.amountAlreadyReceived ?? 0,
    );
    if (amountAlreadyReceived > refundCreditAmount) {
      throw new HttpReplyError(
        400,
        "amountAlreadyReceived cannot exceed refundCreditAmount",
      );
    }

    return createReceivable(userId, RECEIVABLE_TYPES.TAX_REFUND_VAT_CREDIT, {
      grossAmount: refundCreditAmount,
      amountReceived: amountAlreadyReceived,
      status: input.status,
      dueDate: parseDateOnly(input.expectedRefundDate, "expectedRefundDate"),
      payload: {
        taxAuthority: input.taxAuthority.trim(),
        taxType: input.taxType,
        taxPeriod: input.taxPeriod.trim(),
        filingReference: input.filingReference.trim(),
        reason: input.reason,
        evidenceUrl: input.evidenceUrl?.trim() || null,
      },
      ledgerDate: parseDateOnly(input.expectedRefundDate, "expectedRefundDate"),
    });
  },

  async createInvestmentIncome(
    userId: string,
    input: {
      investmentName: string;
      investmentType: string;
      investmentAccountReference: string;
      incomeType: string;
      principalAmount: number;
      incomeAmount: number;
      incomeAccrualDate: string;
      paymentDueDate: string;
      payerEntity: string;
      referenceNumber: string;
      whtCreditNoteAvailable: boolean;
      amountReceived?: number;
      whtDeducted?: number;
    },
  ) {
    const incomeAmount = normalizeMoneyAmount(input.incomeAmount);
    const amountReceived = normalizeMoneyAmount(input.amountReceived ?? 0);
    const whtDeducted = normalizeMoneyAmount(input.whtDeducted ?? 0);
    if (amountReceived > incomeAmount) {
      throw new HttpReplyError(400, "amountReceived cannot exceed incomeAmount");
    }
    if (whtDeducted > incomeAmount) {
      throw new HttpReplyError(400, "whtDeducted cannot exceed incomeAmount");
    }

    return createReceivable(userId, RECEIVABLE_TYPES.INVESTMENT_INCOME_OWED, {
      grossAmount: incomeAmount,
      amountReceived,
      status: settlementStatus(incomeAmount, amountReceived),
      dueDate: parseDateOnly(input.paymentDueDate, "paymentDueDate"),
      payload: {
        investmentName: input.investmentName.trim(),
        investmentType: input.investmentType,
        investmentAccountReference: input.investmentAccountReference.trim(),
        incomeType: input.incomeType,
        principalAmount: normalizeMoneyAmount(input.principalAmount),
        incomeAccrualDate: input.incomeAccrualDate,
        payerEntity: input.payerEntity.trim(),
        referenceNumber: input.referenceNumber.trim(),
        whtCreditNoteAvailable: input.whtCreditNoteAvailable,
        whtDeducted,
      },
      ledgerDate: parseDateOnly(input.incomeAccrualDate, "incomeAccrualDate"),
    });
  },

  async list(userId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [rows, total] = await Promise.all([
      prisma.receivable.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.receivable.count({ where: { userId } }),
    ]);

    const all = await prisma.receivable.findMany({
      where: { userId },
      select: { type: true, outstandingAmount: true },
    });

    const summary = {
      totalReceivables: normalizeMoneyAmount(
        all.reduce((s, r) => s + d(r.outstandingAmount), 0),
      ),
      fixedAssetSaleReceivables: normalizeMoneyAmount(
        all
          .filter((r) => r.type === RECEIVABLE_TYPES.FIXED_ASSET_SALE_ON_CREDIT)
          .reduce((s, r) => s + d(r.outstandingAmount), 0),
      ),
      supplierRefundReceivables: normalizeMoneyAmount(
        all
          .filter((r) => r.type === RECEIVABLE_TYPES.SUPPLIER_REFUND_OVERPAYMENT)
          .reduce((s, r) => s + d(r.outstandingAmount), 0),
      ),
      employeeAdvanceReceivables: normalizeMoneyAmount(
        all
          .filter((r) => r.type === RECEIVABLE_TYPES.EMPLOYEE_DIRECTOR_ADVANCE)
          .reduce((s, r) => s + d(r.outstandingAmount), 0),
      ),
      taxReceivables: normalizeMoneyAmount(
        all
          .filter((r) => r.type === RECEIVABLE_TYPES.TAX_REFUND_VAT_CREDIT)
          .reduce((s, r) => s + d(r.outstandingAmount), 0),
      ),
      investmentIncomeReceivables: normalizeMoneyAmount(
        all
          .filter((r) => r.type === RECEIVABLE_TYPES.INVESTMENT_INCOME_OWED)
          .reduce((s, r) => s + d(r.outstandingAmount), 0),
      ),
    };

    return {
      summary,
      receivables: rows.map(formatListItem),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  },

  async getById(userId: string, receivableId: string) {
    const row = await prisma.receivable.findFirst({
      where: {
        userId,
        OR: [{ id: receivableId }, { receivableCode: receivableId }],
      },
    });
    if (!row) throw new HttpReplyError(404, "Receivable not found");
    return formatDetail(row);
  },
};
