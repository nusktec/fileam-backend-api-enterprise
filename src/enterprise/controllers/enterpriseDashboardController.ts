import { Response } from "express";
import { IRequest } from "../../interfaces/CustomRequest";
import { getAuthUserId } from "../../utils/authHelpers";
import { sendResult, sendServerError } from "../utils/controllerHelpers";
import * as enterpriseDashboardService from "../services/enterpriseDashboardService";

export async function getGlobalDashboard(
  req: IRequest,
  res: Response,
): Promise<void> {
  try {
    const consultantUserId = getAuthUserId(req);
    const data = await enterpriseDashboardService.getGlobalDashboard(
      consultantUserId,
    );
    sendResult(res, "Global dashboard", data);
  } catch {
    sendServerError(res, "Failed to get dashboard");
  }
}
