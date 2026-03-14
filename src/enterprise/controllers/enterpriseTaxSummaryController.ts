import { Response } from "express";
import { IRequest } from "../../interfaces/CustomRequest";
import {
  sendNotFound,
  sendResult,
  sendServerError,
} from "../utils/controllerHelpers";
import { getVatSummary } from "../services/enterpriseTaxSummaryService";

export async function getTaxSummaryHandler(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = req.companyId!;
  try {
    const summary = await getVatSummary(companyId, req.linkedUserId);
    if (!summary) {
      sendNotFound(res, "Company not found");
      return;
    }
    sendResult(res, "Tax summary", summary);
  } catch {
    sendServerError(res, "Failed to get tax summary");
  }
}
