import { prisma } from "../../../config/database";
import { HttpReplyError } from "../../../utils/httpReplyError";
import { HttpStatusCode } from "../../../interfaces/system";
import {
  PIPELINE_ADVANCE_STAGES,
  PIPELINE_STAGES,
  RECORD_TYPES,
  type PipelineStage,
} from "../constants";
import { decimalToNumber, formatYmd, parsePositiveInt } from "../utils";

function parseTransactionId(id: string): {
  recordType: string;
  recordId: string;
} | null {
  if (id.startsWith("sale-")) {
    return { recordType: RECORD_TYPES.SALE, recordId: id.slice("sale-".length) };
  }
  if (id.startsWith("expense-")) {
    return {
      recordType: RECORD_TYPES.EXPENSE,
      recordId: id.slice("expense-".length),
    };
  }
  return { recordType: RECORD_TYPES.SALE, recordId: id };
}

async function stageMap(clientUserId: string) {
  const rows = await prisma.enterprisePipelineStage.findMany({
    where: { clientUserId },
  });
  const map = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    map.set(`${r.recordType}:${r.recordId}`, r);
  }
  return map;
}

export const featuresTransactionsService = {
  async list(
    clientUserId: string,
    pageRaw?: unknown,
    limitRaw?: unknown,
  ) {
    const page = parsePositiveInt(pageRaw, 1);
    const limit = parsePositiveInt(limitRaw, 50);
    const stages = await stageMap(clientUserId);

    const [sales, expenses] = await Promise.all([
      prisma.sale.findMany({
        where: { userId: clientUserId, undoAt: null },
        orderBy: [{ saleDate: "desc" }, { createdAt: "desc" }],
      }),
      prisma.expense.findMany({
        where: { userId: clientUserId, undoAt: null },
        orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
      }),
    ]);

    const items = [
      ...sales.map((s) => {
        const stage =
          stages.get(`${RECORD_TYPES.SALE}:${s.id}`)?.pipelineStage ??
          PIPELINE_STAGES.IMPORTED;
        return {
          id: `sale-${s.id}`,
          date: formatYmd(s.saleDate),
          description: s.description,
          amount: decimalToNumber(s.totalAmount),
          type: "Income",
          status: s.status,
          pipelineStage: stage,
          evidenceMatched: Boolean(s.evidenceVaultId),
        };
      }),
      ...expenses.map((e) => {
        const stage =
          stages.get(`${RECORD_TYPES.EXPENSE}:${e.id}`)?.pipelineStage ??
          PIPELINE_STAGES.IMPORTED;
        return {
          id: `expense-${e.id}`,
          date: formatYmd(e.expenseDate),
          description: e.description,
          amount: decimalToNumber(e.totalAmount),
          type: "Expense",
          status: e.status,
          pipelineStage: stage,
          evidenceMatched: Boolean(e.receiptUrl),
        };
      }),
    ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    const total = items.length;
    const slice = items.slice((page - 1) * limit, page * limit);
    return {
      transactions: slice,
      pagination: { total, page, limit },
    };
  },

  async advanceStage(
    clientUserId: string,
    transactionId: string,
    stageRaw: string,
  ) {
    const stage = stageRaw.trim().toUpperCase() as PipelineStage;
    if (!PIPELINE_ADVANCE_STAGES.includes(stage)) {
      throw new HttpReplyError(
        HttpStatusCode.BAD_REQUEST,
        "Invalid stage. Use REVIEWED, ADJUSTED, or FINALIZED.",
      );
    }

    const parsed = parseTransactionId(transactionId);
    if (!parsed) {
      throw new HttpReplyError(HttpStatusCode.NOT_FOUND, "Transaction not found");
    }

    let evidenceMatched = false;
    if (parsed.recordType === RECORD_TYPES.SALE) {
      const sale = await prisma.sale.findFirst({
        where: { id: parsed.recordId, userId: clientUserId, undoAt: null },
      });
      if (!sale) {
        throw new HttpReplyError(
          HttpStatusCode.NOT_FOUND,
          "Transaction not found",
        );
      }
      evidenceMatched = Boolean(sale.evidenceVaultId);
    } else {
      const expense = await prisma.expense.findFirst({
        where: { id: parsed.recordId, userId: clientUserId, undoAt: null },
      });
      if (!expense) {
        throw new HttpReplyError(
          HttpStatusCode.NOT_FOUND,
          "Transaction not found",
        );
      }
      evidenceMatched = Boolean(expense.receiptUrl);
    }

    const existing = await prisma.enterprisePipelineStage.findUnique({
      where: {
        recordType_recordId: {
          recordType: parsed.recordType,
          recordId: parsed.recordId,
        },
      },
    });

    if (stage === PIPELINE_STAGES.IMPORTED) {
      throw new HttpReplyError(
        HttpStatusCode.BAD_REQUEST,
        "Cannot go back to IMPORTED once advanced",
      );
    }

    const ledgerConfirmed =
      existing?.ledgerConfirmed === true ||
      (await prisma.ledgerTransaction.count({
        where: {
          userId: clientUserId,
          referenceId: parsed.recordId,
          status: { in: ["POSTED", "REVERSED"] },
        },
      })) > 0;

    if (stage === PIPELINE_STAGES.FINALIZED) {
      if (!evidenceMatched || !ledgerConfirmed) {
        throw new HttpReplyError(
          HttpStatusCode.UNPROCESSABLE_ENTITY,
          "Transaction can only be Finalized once evidence is matched in the Evidence Vault and the consultant has confirmed the ledger entry.",
        );
      }
    }

    const updated = await prisma.enterprisePipelineStage.upsert({
      where: {
        recordType_recordId: {
          recordType: parsed.recordType,
          recordId: parsed.recordId,
        },
      },
      create: {
        clientUserId,
        recordType: parsed.recordType,
        recordId: parsed.recordId,
        pipelineStage: stage,
        evidenceMatched,
        ledgerConfirmed,
      },
      update: {
        pipelineStage: stage,
        evidenceMatched,
        ledgerConfirmed,
      },
    });

    return {
      id: `${parsed.recordType}-${parsed.recordId}`,
      pipelineStage: updated.pipelineStage,
      updatedAt: updated.updatedAt.toISOString(),
    };
  },
};
