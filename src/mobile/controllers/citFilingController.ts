import { Response } from "express";
import { matchedData, validationResult } from "express-validator";
import { IRequest } from "../../interfaces/CustomRequest";
import { getAuthUserId } from "../../utils/authHelpers";
import { HttpReplyError } from "../../utils/httpReplyError";
import { citFilingService } from "../services/citFilingService";

function ensureValid(req: IRequest) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new HttpReplyError(
      422,
      "Validation failed",
      errors.array(),
      "VALIDATION_ERROR",
    );
  }
}

function replyError(res: Response, error: unknown): boolean {
  if (error instanceof HttpReplyError) {
    res.status(error.statusCode).json({
      message: error.message,
      error: error.errorCode ?? "VALIDATION_ERROR",
      ...(error.data ? { details: error.data } : {}),
    });
    return true;
  }
  return false;
}

export const getCitCalculation = async (req: IRequest, res: Response) => {
  try {
    ensureValid(req);
    const userId = getAuthUserId(req);
    const year = Number(req.query.year);
    const data = await citFilingService.getCalculation(userId, year);
    res.status(200).json({ data });
  } catch (error) {
    if (replyError(res, error)) return;
    res
      .status(500)
      .json({ message: "Failed to get CIT calculation", error: "SERVER_ERROR" });
  }
};

export const submitCitFiling = async (req: IRequest, res: Response) => {
  try {
    ensureValid(req);
    const userId = getAuthUserId(req);
    const body = matchedData(req, { locations: ["body"], includeOptionals: true });
    const data = await citFilingService.submit(
      userId,
      body as Record<string, unknown>,
    );
    res.status(200).json({ data });
  } catch (error) {
    if (replyError(res, error)) return;
    res
      .status(500)
      .json({ message: "Failed to submit CIT filing", error: "SERVER_ERROR" });
  }
};
