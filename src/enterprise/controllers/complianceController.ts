import { Response } from "express";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { getAuthUserId } from "../../utils/authHelpers";
import * as complianceService from "../services/complianceService";

export const getComplianceStats = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const consultantUserId = getAuthUserId(req);
    const stats = await complianceService.getComplianceStats(consultantUserId);
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Compliance stats retrieved", stats));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to get compliance stats", null));
  }
};

export const getUpcomingDeadlines = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const consultantUserId = getAuthUserId(req);
    const limit = req.query.limit
      ? parseInt(String(req.query.limit), 10)
      : undefined;
    const rows = await complianceService.getUpcomingDeadlines(consultantUserId, {
      limit,
    });
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Upcoming deadlines retrieved", rows));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to get upcoming deadlines", null));
  }
};
