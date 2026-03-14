import { Response } from "express";
import { IRequest } from "../../interfaces/CustomRequest";
import {
  sendNotFound,
  sendResult,
  sendServerError,
} from "../utils/controllerHelpers";
import { sendPaginated } from "../../utils/responseHelpers";
import { listReports } from "../services/enterpriseReportsService";

export async function listReportsHandler(
  req: IRequest,
  res: Response,
): Promise<void> {
  const linkedUserId = req.linkedUserId!;
  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : 20;
  const reportType = req.query.reportType as string | undefined;
  try {
    const result = await listReports(linkedUserId, {
      page,
      limit,
      reportType,
    });
    sendPaginated(
      res,
      "Reports",
      result.data,
      result.total,
      result.page,
      result.limit,
    );
  } catch {
    sendServerError(res, "Failed to list reports");
  }
}
