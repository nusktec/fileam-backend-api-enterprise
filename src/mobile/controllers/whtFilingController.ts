import { Response } from "express";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { whtFilingService } from "../services/whtFilingService";

function parsePeriod(period?: string): { year: number; month: number } | null {
  if (!period || typeof period !== "string") return null;
  const match = period.match(/^(\d{4})-(\d{1,2})$/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

export const getWhtSchedule = async (req: IRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(HttpStatusCode.UNAUTHORIZED).json(outJson(false, "Unauthorized", null));
      return;
    }
    const period = req.query.period as string | undefined;
    const whtType = req.query.whtType as string | undefined;
    const parsed = parsePeriod(period) ?? (req.query.year && req.query.month)
      ? { year: Number(req.query.year), month: Number(req.query.month) }
      : null;
    if (!parsed || !parsed.year || !parsed.month) {
      res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "Query period (e.g. 2025-1) or year and month required", null));
      return;
    }
    const data = await whtFilingService.getSchedule(userId, parsed.year, parsed.month, whtType);
    res.status(HttpStatusCode.OK).json(outJson(true, "WHT schedule retrieved", data));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to get WHT schedule", null));
  }
};

export const createOrUpdateWhtDraft = async (req: IRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(HttpStatusCode.UNAUTHORIZED).json(outJson(false, "Unauthorized", null));
      return;
    }
    const { periodYear, periodMonth, whtType, lines } = req.body ?? {};
    if (periodYear == null || periodMonth == null) {
      res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "periodYear and periodMonth required", null));
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

export const submitWhtFiling = async (req: IRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(HttpStatusCode.UNAUTHORIZED).json(outJson(false, "Unauthorized", null));
      return;
    }
    const {
      periodYear,
      periodMonth,
      totalWht,
      dueDate,
      paymentStatus,
      receiptUrl,
      documentUrl,
      evidenceVaultId,
    } = req.body ?? {};
    if (periodYear == null || periodMonth == null || totalWht == null) {
      res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "periodYear, periodMonth and totalWht required", null));
      return;
    }
    const paid = paymentStatus === "paid" || paymentStatus === "Paid";
    const data = await whtFilingService.submit(userId, {
      periodYear: Number(periodYear),
      periodMonth: Number(periodMonth),
      totalWht: Number(totalWht),
      dueDate: dueDate ? new Date(dueDate) : new Date(Number(periodYear), Number(periodMonth), 21),
      paymentStatus: paid ? "paid" : "not_paid",
      receiptUrl,
      documentUrl,
      evidenceVaultId,
    });
    res.status(HttpStatusCode.OK).json(outJson(true, "WHT filing submitted", data));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to submit WHT filing", null));
  }
};
