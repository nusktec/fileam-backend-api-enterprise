import { Response } from "express";
import { matchedData, validationResult } from "express-validator";
import { IRequest } from "../../interfaces/CustomRequest";
import { getAuthUserId } from "../../utils/authHelpers";
import { HttpReplyError } from "../../utils/httpReplyError";
import { payersService } from "../services/payersService";
import { payerUndoService } from "../services/payerUndoService";
import type {
  PayerTransactionUndoReason,
  PayerUndoReason,
} from "../../constants/recordUndo";

function paramId(req: IRequest, key: string): string {
  const v = req.params[key];
  return Array.isArray(v) ? v[0]! : v!;
}

function ensureValid(req: IRequest) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new HttpReplyError(400, "Validation failed", errors.array());
  }
}

function replyError(res: Response, error: unknown): boolean {
  if (error instanceof HttpReplyError) {
    res.status(error.statusCode).json({
      error: error.message,
      ...(error.data ? { details: error.data } : {}),
    });
    return true;
  }
  return false;
}

export const createPayer = async (req: IRequest, res: Response) => {
  try {
    ensureValid(req);
    const userId = getAuthUserId(req);
    const body = matchedData(req, {
      locations: ["body"],
      includeOptionals: true,
    });
    const data = await payersService.create(userId, body as never);
    res.status(201).json({ data });
  } catch (error) {
    if (replyError(res, error)) return;
    res.status(500).json({ error: "Failed to create payer" });
  }
};

export const listPayers = async (req: IRequest, res: Response) => {
  try {
    ensureValid(req);
    const userId = getAuthUserId(req);
    const query = matchedData(req, {
      locations: ["query"],
      includeOptionals: true,
    }) as {
      status?: "ALL" | "AR_BALANCE" | "OVERDUE" | "VOIDED";
      search?: string;
      page?: number;
      limit?: number;
    };
    const data = await payersService.list(userId, query);
    res.status(200).json({ data });
  } catch (error) {
    if (replyError(res, error)) return;
    res.status(500).json({ error: "Failed to list payers" });
  }
};

export const getPayer = async (req: IRequest, res: Response) => {
  try {
    ensureValid(req);
    const userId = getAuthUserId(req);
    const data = await payersService.getById(userId, paramId(req, "id"));
    res.status(200).json({ data });
  } catch (error) {
    if (replyError(res, error)) return;
    res.status(500).json({ error: "Failed to get payer" });
  }
};

export const updatePayer = async (req: IRequest, res: Response) => {
  try {
    ensureValid(req);
    const userId = getAuthUserId(req);
    const body = matchedData(req, {
      locations: ["body"],
      includeOptionals: true,
    });
    const data = await payersService.update(
      userId,
      paramId(req, "id"),
      body as never,
    );
    res.status(200).json({ data });
  } catch (error) {
    if (replyError(res, error)) return;
    res.status(500).json({ error: "Failed to update payer" });
  }
};

export const createPayerTransaction = async (req: IRequest, res: Response) => {
  try {
    ensureValid(req);
    const userId = getAuthUserId(req);
    const body = matchedData(req, {
      locations: ["body"],
      includeOptionals: true,
    });
    const data = await payersService.createTransaction(
      userId,
      paramId(req, "id"),
      body as never,
    );
    res.status(201).json({ data });
  } catch (error) {
    if (replyError(res, error)) return;
    res.status(500).json({ error: "Failed to record transaction" });
  }
};

export const listPayerTransactions = async (req: IRequest, res: Response) => {
  try {
    ensureValid(req);
    const userId = getAuthUserId(req);
    const query = matchedData(req, {
      locations: ["query"],
      includeOptionals: true,
    }) as { search?: string; status?: string };
    const data = await payersService.listTransactions(
      userId,
      paramId(req, "id"),
      query as never,
    );
    res.status(200).json({ data });
  } catch (error) {
    if (replyError(res, error)) return;
    res.status(500).json({ error: "Failed to list transactions" });
  }
};

export const listPayerReceivables = async (req: IRequest, res: Response) => {
  try {
    ensureValid(req);
    const userId = getAuthUserId(req);
    const data = await payersService.listReceivables(
      userId,
      paramId(req, "id"),
    );
    res.status(200).json({ data });
  } catch (error) {
    if (replyError(res, error)) return;
    res.status(500).json({ error: "Failed to list receivables" });
  }
};

export const recordPayerInvoicePayment = async (
  req: IRequest,
  res: Response,
) => {
  try {
    ensureValid(req);
    const userId = getAuthUserId(req);
    const body = matchedData(req, { locations: ["body"] }) as {
      amount: number;
      paymentType: "Cash" | "Transfer" | "Card";
    };
    const data = await payersService.recordInvoicePayment(
      userId,
      paramId(req, "id"),
      paramId(req, "transactionId"),
      body,
    );
    res.status(200).json({ data });
  } catch (error) {
    if (replyError(res, error)) return;
    res.status(500).json({ error: "Failed to record payment" });
  }
};

export const createPayerDocument = async (req: IRequest, res: Response) => {
  try {
    ensureValid(req);
    const userId = getAuthUserId(req);
    const body = matchedData(req, {
      locations: ["body"],
      includeOptionals: true,
    });
    const data = await payersService.createDocument(
      userId,
      paramId(req, "id"),
      body as never,
    );
    res.status(201).json({ data });
  } catch (error) {
    if (replyError(res, error)) return;
    res.status(500).json({ error: "Failed to create document" });
  }
};

export const listPayerDocuments = async (req: IRequest, res: Response) => {
  try {
    ensureValid(req);
    const userId = getAuthUserId(req);
    const query = matchedData(req, {
      locations: ["query"],
      includeOptionals: true,
    }) as { search?: string };
    const data = await payersService.listDocuments(
      userId,
      paramId(req, "id"),
      query.search,
    );
    res.status(200).json({ data });
  } catch (error) {
    if (replyError(res, error)) return;
    res.status(500).json({ error: "Failed to list documents" });
  }
};

export const getPayerUndoCheck = async (req: IRequest, res: Response) => {
  try {
    ensureValid(req);
    const userId = getAuthUserId(req);
    const result = await payerUndoService.getPayerUndoCheck(
      userId,
      paramId(req, "id"),
    );
    if (!result) {
      res.status(404).json({ error: "Payer not found" });
      return;
    }
    res.status(200).json({ data: result });
  } catch (error) {
    if (replyError(res, error)) return;
    res.status(500).json({ error: "Failed to check payer undo" });
  }
};

export const undoPayer = async (req: IRequest, res: Response) => {
  try {
    ensureValid(req);
    const userId = getAuthUserId(req);
    const body = matchedData(req, { locations: ["body"] }) as { reason: string };
    const result = await payerUndoService.undoPayer(
      userId,
      paramId(req, "id"),
      body.reason as PayerUndoReason,
    );
    if (!result) {
      res.status(404).json({ error: "Payer not found" });
      return;
    }
    res.status(200).json({ data: result });
  } catch (error) {
    if (replyError(res, error)) return;
    res.status(500).json({ error: "Failed to undo payer" });
  }
};

export const getPayerTransactionUndoCheck = async (
  req: IRequest,
  res: Response,
) => {
  try {
    ensureValid(req);
    const userId = getAuthUserId(req);
    const result = await payerUndoService.getTransactionUndoCheck(
      userId,
      paramId(req, "id"),
      paramId(req, "transactionId"),
    );
    if (!result) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }
    res.status(200).json({ data: result });
  } catch (error) {
    if (replyError(res, error)) return;
    res.status(500).json({ error: "Failed to check transaction undo" });
  }
};

export const undoPayerTransaction = async (req: IRequest, res: Response) => {
  try {
    ensureValid(req);
    const userId = getAuthUserId(req);
    const body = matchedData(req, { locations: ["body"] }) as { reason: string };
    const result = await payerUndoService.undoTransaction(
      userId,
      paramId(req, "id"),
      paramId(req, "transactionId"),
      body.reason as PayerTransactionUndoReason,
    );
    if (!result) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }
    res.status(200).json({ data: result });
  } catch (error) {
    if (replyError(res, error)) return;
    res.status(500).json({ error: "Failed to undo transaction" });
  }
};
