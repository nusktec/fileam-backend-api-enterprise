import { Response } from "express";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { vatFilingService } from "../services/vatFilingService";

function parsePeriod(period?: string): { year: number; month: number } | null {
  if (!period || typeof period !== "string") return null;
  const match = period.match(/^(\d{4})-(\d{1,2})$/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

export const getVatCalculation = async (req: IRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(HttpStatusCode.UNAUTHORIZED).json(outJson(false, "Unauthorized", null));
      return;
    }
    const period = req.query.period as string | undefined;
    const parsed = parsePeriod(period) ?? (req.query.year && req.query.month)
      ? { year: Number(req.query.year), month: Number(req.query.month) }
      : null;
    if (!parsed || !parsed.year || !parsed.month) {
      res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "Query period (e.g. 2025-1) or year and month required", null));
      return;
    }
    const data = await vatFilingService.getCalculation(userId, parsed.year, parsed.month);
    res.status(HttpStatusCode.OK).json(outJson(true, "VAT calculation retrieved", data));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to get VAT calculation", null));
  }
};

export const createOrUpdateVatDraft = async (req: IRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(HttpStatusCode.UNAUTHORIZED).json(outJson(false, "Unauthorized", null));
      return;
    }
    const { periodYear, periodMonth, stateOfOperation, vatRegistrationNumber } = req.body ?? {};
    if (periodYear == null || periodMonth == null) {
      res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "periodYear and periodMonth required", null));
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

export const submitVatFiling = async (req: IRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(HttpStatusCode.UNAUTHORIZED).json(outJson(false, "Unauthorized", null));
      return;
    }
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
    } = req.body ?? {};
    if (periodYear == null || periodMonth == null || amount == null) {
      res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "periodYear, periodMonth and amount required", null));
      return;
    }
    const paid = paymentStatus === "paid" || paymentStatus === "Paid";
    const data = await vatFilingService.submit(userId, {
      periodYear: Number(periodYear),
      periodMonth: Number(periodMonth),
      amount: Number(amount),
      dueDate: dueDate ? new Date(dueDate) : new Date(Number(periodYear), Number(periodMonth), 21),
      paymentStatus: paid ? "paid" : "not_paid",
      receiptUrl,
      documentUrl,
      evidenceVaultId,
      stateOfOperation,
      vatRegistrationNumber,
    });
    res.status(HttpStatusCode.OK).json(outJson(true, "VAT filing submitted", data));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to submit VAT filing", null));
  }
};
