import { Response } from "express";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { getAuthUserId } from "../../utils/authHelpers";
import { whtFilingService } from "../services/whtFilingService";
import { vatWhtOverviewService } from "../services/vatWhtOverviewService";
import { HttpReplyError } from "../../utils/httpReplyError";

export const getWhtOverview = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const data = await vatWhtOverviewService.getWhtOverview(
      userId,
      req.query.period,
    );
    res.status(HttpStatusCode.OK).json(outJson(true, "WHT overview", data));
  } catch (error) {
    if (error instanceof HttpReplyError) {
      res.status(error.statusCode).json(outJson(false, error.message, null));
      return;
    }
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to get WHT overview", null));
  }
};

export const getWhtSchedule = async (
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
    const data = await vatWhtOverviewService.getWhtSchedule(userId, period);
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "WHT schedule retrieved", data));
  } catch (error) {
    if (error instanceof HttpReplyError) {
      res.status(error.statusCode).json(outJson(false, error.message, null));
      return;
    }
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to get WHT schedule", null));
  }
};

export const createOrUpdateWhtDraft = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const { periodYear, periodMonth, whtType, lines } = req.body ?? {};
    if (periodYear == null || periodMonth == null) {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(outJson(false, "periodYear and periodMonth required", null));
      return;
    }
    const data = await whtFilingService.createOrUpdateDraft(userId, {
      periodYear: Number(periodYear),
      periodMonth: Number(periodMonth),
      whtType,
      lines: Array.isArray(lines) ? lines : [],
    });
    res.status(HttpStatusCode.OK).json(outJson(true, "WHT draft saved", data));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to save WHT draft", null));
  }
};

export const submitWhtFiling = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const {
      periodYear,
      periodMonth,
      totalWht,
      amount,
      dueDate,
      paymentStatus,
      receiptUrl,
      documentUrl,
      evidenceVaultId,
      submissionReference,
    } = req.body ?? {};
    if (periodYear == null || periodMonth == null) {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(outJson(false, "periodYear and periodMonth required", null));
      return;
    }
    let whtAmount =
      totalWht != null
        ? Number(totalWht)
        : amount != null
          ? Number(amount)
          : NaN;
    if (!Number.isFinite(whtAmount)) {
      const sched = await whtFilingService.getSchedule(
        userId,
        Number(periodYear),
        Number(periodMonth),
      );
      whtAmount = Number(sched.totalWht ?? 0);
    }
    const paid = paymentStatus === "paid" || paymentStatus === "Paid";
    const data = await whtFilingService.submit(userId, {
      periodYear: Number(periodYear),
      periodMonth: Number(periodMonth),
      totalWht: whtAmount,
      dueDate: dueDate
        ? new Date(dueDate)
        : new Date(Number(periodYear), Number(periodMonth), 21),
      paymentStatus: paid ? "paid" : "not_paid",
      receiptUrl,
      documentUrl,
      evidenceVaultId,
      submissionReference,
    });
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "WHT filing submitted", data));
  } catch (error) {
    if (error instanceof HttpReplyError) {
      res.status(error.statusCode).json(outJson(false, error.message, null));
      return;
    }
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to submit WHT filing", null));
  }
};
