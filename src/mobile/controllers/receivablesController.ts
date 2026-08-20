import { Response } from "express";
import { matchedData } from "express-validator";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { getAuthUserId } from "../../utils/authHelpers";
import { PaginationRequest } from "../../middlewares/paginationMiddleware";
import { HttpReplyError } from "../../utils/httpReplyError";
import { receivablesService } from "../services/receivablesService";

function replyError(res: Response, error: unknown): boolean {
  if (error instanceof HttpReplyError) {
    res.status(error.statusCode).json(outJson(false, error.message, null));
    return true;
  }
  return false;
}

function paramId(req: IRequest): string {
  const raw = req.params.receivableId ?? req.params.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  return id!;
}

export const createFixedAssetSaleReceivable = async (
  req: IRequest,
  res: Response,
) => {
  try {
    const userId = getAuthUserId(req);
    const body = matchedData(req, {
      locations: ["body"],
      includeOptionals: true,
    }) as Parameters<typeof receivablesService.createFixedAssetSale>[1];
    const data = await receivablesService.createFixedAssetSale(userId, body);
    res
      .status(HttpStatusCode.CREATED)
      .json(
        outJson(true, "Fixed asset sale receivable created successfully", data),
      );
  } catch (error) {
    if (replyError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to create receivable", null));
  }
};

export const createSupplierRefundReceivable = async (
  req: IRequest,
  res: Response,
) => {
  try {
    const userId = getAuthUserId(req);
    const body = matchedData(req, {
      locations: ["body"],
      includeOptionals: true,
    }) as Parameters<typeof receivablesService.createSupplierRefund>[1];
    const data = await receivablesService.createSupplierRefund(userId, body);
    res
      .status(HttpStatusCode.CREATED)
      .json(
        outJson(true, "Supplier refund receivable created successfully", data),
      );
  } catch (error) {
    if (replyError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to create receivable", null));
  }
};

export const createEmployeeDirectorAdvanceReceivable = async (
  req: IRequest,
  res: Response,
) => {
  try {
    const userId = getAuthUserId(req);
    const body = matchedData(req, {
      locations: ["body"],
      includeOptionals: true,
    }) as Parameters<
      typeof receivablesService.createEmployeeDirectorAdvance
    >[1];
    const data = await receivablesService.createEmployeeDirectorAdvance(
      userId,
      body,
    );
    res
      .status(HttpStatusCode.CREATED)
      .json(
        outJson(
          true,
          "Employee/director advance receivable created successfully",
          data,
        ),
      );
  } catch (error) {
    if (replyError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to create receivable", null));
  }
};

export const createTaxRefundReceivable = async (
  req: IRequest,
  res: Response,
) => {
  try {
    const userId = getAuthUserId(req);
    const body = matchedData(req, {
      locations: ["body"],
      includeOptionals: true,
    }) as Parameters<typeof receivablesService.createTaxRefund>[1];
    const data = await receivablesService.createTaxRefund(userId, body);
    res
      .status(HttpStatusCode.CREATED)
      .json(
        outJson(true, "Tax refund/credit receivable created successfully", data),
      );
  } catch (error) {
    if (replyError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to create receivable", null));
  }
};

export const createInvestmentIncomeReceivable = async (
  req: IRequest,
  res: Response,
) => {
  try {
    const userId = getAuthUserId(req);
    const body = matchedData(req, {
      locations: ["body"],
      includeOptionals: true,
    }) as Parameters<typeof receivablesService.createInvestmentIncome>[1];
    const data = await receivablesService.createInvestmentIncome(userId, body);
    res
      .status(HttpStatusCode.CREATED)
      .json(
        outJson(true, "Investment income receivable created successfully", data),
      );
  } catch (error) {
    if (replyError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to create receivable", null));
  }
};

export const listReceivables = async (
  req: PaginationRequest,
  res: Response,
) => {
  try {
    const userId = getAuthUserId(req);
    const page = req.pagination?.page ?? 1;
    const limit = req.pagination?.limit ?? 20;
    const data = await receivablesService.list(userId, page, limit);
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Receivables retrieved successfully", data));
  } catch (error) {
    if (replyError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to list receivables", null));
  }
};

export const getReceivableById = async (req: IRequest, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const data = await receivablesService.getById(userId, paramId(req));
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Receivable retrieved successfully", data));
  } catch (error) {
    if (replyError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to get receivable", null));
  }
};
