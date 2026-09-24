import { Response } from "express";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { getAuthUserId } from "../../utils/authHelpers";
import { HttpReplyError } from "../../utils/httpReplyError";
import { citReportsService } from "../services/citReportsService";

export const listCitReports = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const data = await citReportsService.list(userId, req.query.year);
    res.status(HttpStatusCode.OK).json(outJson(true, "CIT reports", data));
  } catch (error) {
    if (error instanceof HttpReplyError) {
      res.status(error.statusCode).json(outJson(false, error.message, null));
      return;
    }
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to load CIT reports", null));
  }
};

export const downloadCitReportFile = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const reportId = Array.isArray(req.params.reportId)
      ? req.params.reportId[0]
      : req.params.reportId;
    const { filename, buffer } = await citReportsService.file(
      userId,
      reportId ?? "",
      req.query.year,
    );
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(HttpStatusCode.OK).send(buffer);
  } catch (error) {
    if (error instanceof HttpReplyError) {
      res.status(error.statusCode).json(outJson(false, error.message, null));
      return;
    }
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to download CIT report", null));
  }
};
