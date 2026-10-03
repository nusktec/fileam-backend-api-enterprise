import { Response } from "express";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { getAuthUserId } from "../../utils/authHelpers";
import { vatFilingService } from "../services/vatFilingService";
import { vatWhtOverviewService } from "../services/vatWhtOverviewService";
import { HttpReplyError } from "../../utils/httpReplyError";

export const getVatOverview = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const data = await vatWhtOverviewService.getVatOverview(
      userId,
      req.query.period,
    );
    res.status(HttpStatusCode.OK).json(outJson(true, "VAT overview", data));
  } catch (error) {
    if (error instanceof HttpReplyError) {
      res.status(error.statusCode).json(outJson(false, error.message, null));
      return;
    }
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to get VAT overview", null));
  }
};

export const getVatCalculation = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const period =
      (req.query.period as string | undefined) ??
      (req.query.year && req.query.month
        ? `${req.query.year}-${String(req.query.month).padStart(2, "0")}`
        : undefined);
    const data = await vatWhtOverviewService.getVatCalculation(userId, period);
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "VAT calculation retrieved", data));
  } catch (error) {
    if (error instanceof HttpReplyError) {
      res.status(error.statusCode).json(outJson(false, error.message, null));
      return;
    }
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to get VAT calculation", null));
  }
};

export const createOrUpdateVatDraft = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const { periodYear, periodMonth, stateOfOperation, vatRegistrationNumber } =
      req.body ?? {};
    if (periodYear == null || periodMonth == null) {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(outJson(false, "periodYear and periodMonth required", null));
      return;
    }
    const data = await vatFilingService.createOrUpdateDraft(userId, {
      periodYear: Number(periodYear),
      periodMonth: Number(periodMonth),
      stateOfOperation,
      vatRegistrationNumber,
    });
    res.status(HttpStatusCode.OK).json(outJson(true, "VAT draft saved", data));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to save VAT draft", null));
  }
};

export const submitVatFiling = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const {
      periodYear,
      periodMonth,
      amount,
      dueDate,
      paymentStatus,
      receiptUrl,
      documentUrl,
      evidenceVaultId,
      stateOfOperation,
      vatRegistrationNumber,
      submissionReference,
    } = req.body ?? {};
    if (periodYear == null || periodMonth == null) {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(outJson(false, "periodYear and periodMonth required", null));
      return;
    }
    let vatAmount =
      amount == null || amount === "" ? NaN : Number(amount);
    if (!Number.isFinite(vatAmount)) {
      const calc = await vatFilingService.getCalculation(
        userId,
        Number(periodYear),
        Number(periodMonth),
      );
      vatAmount = Number(calc.netVatPayable ?? 0);
    }
    const paid = paymentStatus === "paid" || paymentStatus === "Paid";
    const data = await vatFilingService.submit(userId, {
      periodYear: Number(periodYear),
      periodMonth: Number(periodMonth),
      amount: vatAmount,
      dueDate: dueDate
        ? new Date(dueDate)
        : new Date(Number(periodYear), Number(periodMonth), 21),
      paymentStatus: paid ? "paid" : "not_paid",
      receiptUrl,
      documentUrl,
      evidenceVaultId,
      stateOfOperation,
      vatRegistrationNumber,
      submissionReference,
    });
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "VAT filing submitted", data));
  } catch (error) {
    if (error instanceof HttpReplyError) {
      res.status(error.statusCode).json(outJson(false, error.message, null));
      return;
    }
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to submit VAT filing", null));
  }
};
