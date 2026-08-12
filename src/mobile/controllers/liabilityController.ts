import { Response } from "express";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { getAuthUserId } from "../../utils/authHelpers";
import { liabilityService } from "../services/liabilityService";

export const getLiabilitySummary = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const data = await liabilityService.getSummary(userId);
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Liability summary retrieved successfully.", data));
  } catch {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve liability summary", null));
  }
};

export const getLiabilityDashboard = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const data = await liabilityService.getDashboard(userId);
    res
      .status(HttpStatusCode.OK)
      .json(
        outJson(true, "Liability dashboard retrieved successfully.", data),
      );
  } catch {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve liability dashboard", null));
  }
};

export const getCurrentLiabilities = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const data = await liabilityService.getCurrentLiabilities(userId);
    res
      .status(HttpStatusCode.OK)
      .json(
        outJson(true, "Current liabilities retrieved successfully.", data),
      );
  } catch {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve current liabilities", null));
  }
};

export const getNonCurrentLiabilities = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const data = await liabilityService.getNonCurrentLiabilities(userId);
    res
      .status(HttpStatusCode.OK)
      .json(
        outJson(true, "Non-current liabilities retrieved successfully.", data),
      );
  } catch {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve non-current liabilities", null));
  }
};

export const getAccountsPayable = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const data = await liabilityService.getAccountsPayable(userId);
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Accounts payable retrieved successfully.", data));
  } catch {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve accounts payable", null));
  }
};

export const getLiabilityCashFlowImpact = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const data = await liabilityService.getCashFlowImpact(userId);
    res
      .status(HttpStatusCode.OK)
      .json(
        outJson(true, "Liability cash flow impact retrieved successfully.", data),
      );
  } catch {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve cash flow impact", null));
  }
};
