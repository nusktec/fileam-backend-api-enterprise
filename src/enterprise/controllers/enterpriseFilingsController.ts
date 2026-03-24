import { Response } from "express";
import { parseDateRangeQuery } from "../../utils/dateRangeQuery";
import { matchedData } from "express-validator";
import { IRequest } from "../../interfaces/CustomRequest";
import { getParam } from "../utils/paramHelpers";
import {
  sendNotFound,
  sendResult,
  sendCreated,
  sendServerError,
  sendBadRequest,
} from "../utils/controllerHelpers";
import { sendPaginated } from "../../utils/responseHelpers";
import {
  getUnfiledItems,
  listFilings,
  getFilingReport,
  createFiling,
  getFilingsSummary,
  getVatReturns,
  submitClientVatReturn,
} from "../services/enterpriseFilingsService";

export async function getFilingsSummaryHandler(
  req: IRequest,
  res: Response,
): Promise<void> {
  const linkedUserId = req.linkedUserId!;
  try {
    const data = await getFilingsSummary(linkedUserId);
    sendResult(res, "Filings summary", data);
  } catch {
    sendServerError(res, "Failed to get filings summary");
  }
}

export async function getVatReturnsHandler(
  req: IRequest,
  res: Response,
): Promise<void> {
  const linkedUserId = req.linkedUserId!;
  try {
    const data = await getVatReturns(linkedUserId);
    sendResult(res, "VAT returns", data);
  } catch {
    sendServerError(res, "Failed to get VAT returns");
  }
}

export async function getUnfiledItemsHandler(
  req: IRequest,
  res: Response,
): Promise<void> {
  const linkedUserId = req.linkedUserId!;
  try {
    const items = await getUnfiledItems(linkedUserId);
    sendResult(res, "Unfiled items", items);
  } catch {
    sendServerError(res, "Failed to get unfiled items");
  }
}

export async function listFilingsHandler(
  req: IRequest,
  res: Response,
): Promise<void> {
  const linkedUserId = req.linkedUserId!;
  const status = req.query.status as string | undefined;
  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : 20;
  const dr = parseDateRangeQuery(req.query as Record<string, unknown>);
  if (!dr.ok) {
    sendBadRequest(res, dr.message);
    return;
  }
  try {
    const result = await listFilings(linkedUserId, {
      page,
      limit,
      status,
      dateFrom: dr.range.dateFrom,
      dateTo: dr.range.dateTo,
    });
    sendPaginated(
      res,
      "Filings",
      result.data,
      result.total,
      result.page,
      result.limit,
    );
  } catch {
    sendServerError(res, "Failed to list filings");
  }
}

export async function createFilingHandler(
  req: IRequest,
  res: Response,
): Promise<void> {
  const linkedUserId = req.linkedUserId!;
  const data = matchedData(req, {
    locations: ["body"],
    includeOptionals: true,
  }) as {
    taxType: string;
    periodYear: number;
    periodMonth: number;
    amount: number;
    paymentStatus?: string;
    dueDate?: string;
    receiptUrl?: string;
    documentUrl?: string;
    evidenceVaultId?: string;
    stateOfOperation?: string;
    vatRegistrationNumber?: string;
  };
  const taxType = (data.taxType ?? "").toUpperCase();
  if (taxType !== "VAT" && taxType !== "WHT") {
    sendBadRequest(res, "taxType must be VAT or WHT");
    return;
  }
  try {
    const result = await createFiling(linkedUserId, {
      taxType: taxType as "VAT" | "WHT",
      periodYear: Number(data.periodYear),
      periodMonth: Number(data.periodMonth),
      amount: Number(data.amount),
      paymentStatus:
        data.paymentStatus === "paid" ? "paid" : "not_paid",
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      receiptUrl: data.receiptUrl,
      documentUrl: data.documentUrl,
      evidenceVaultId: data.evidenceVaultId,
      stateOfOperation: data.stateOfOperation,
      vatRegistrationNumber: data.vatRegistrationNumber,
    });
    if (!result) {
      sendNotFound(res, "Failed to create filing");
      return;
    }
    sendCreated(res, "Filing created", result);
  } catch {
    sendServerError(res, "Failed to create filing");
  }
}

export async function submitClientVatReturnHandler(
  req: IRequest,
  res: Response,
): Promise<void> {
  const linkedUserId = req.linkedUserId!;
  const data = matchedData(req, {
    locations: ["body"],
    includeOptionals: true,
  }) as {
    periodYear: number;
    periodMonth: number;
    amount: number;
    paymentStatus?: string;
    dueDate?: string;
    receiptUrl?: string;
    documentUrl?: string;
    evidenceVaultId?: string;
    stateOfOperation?: string;
    vatRegistrationNumber?: string;
  };
  try {
    const result = await submitClientVatReturn(linkedUserId, {
      periodYear: Number(data.periodYear),
      periodMonth: Number(data.periodMonth),
      amount: Number(data.amount),
      paymentStatus:
        data.paymentStatus === "paid" ? "paid" : "not_paid",
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      receiptUrl: data.receiptUrl,
      documentUrl: data.documentUrl,
      evidenceVaultId: data.evidenceVaultId,
      stateOfOperation: data.stateOfOperation,
      vatRegistrationNumber: data.vatRegistrationNumber,
    });
    if (!result) {
      sendNotFound(res, "Failed to submit VAT return");
      return;
    }
    sendCreated(res, "VAT return submitted", result);
  } catch {
    sendServerError(res, "Failed to submit VAT return");
  }
}

export async function getFilingReportHandler(
  req: IRequest,
  res: Response,
): Promise<void> {
  const linkedUserId = req.linkedUserId!;
  const filingId = getParam(req.params, "filingId");
  try {
    const report = await getFilingReport(linkedUserId, filingId);
    if (!report) {
      sendNotFound(res, "Filing report not found");
      return;
    }
    sendResult(res, "Filing report", report);
  } catch {
    sendServerError(res, "Failed to get filing report");
  }
}
