import { Response } from "express";
import { matchedData } from "express-validator";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { getAuthUserId } from "../../utils/authHelpers";
import { PaginationRequest } from "../../middlewares/paginationMiddleware";
import { HttpReplyError } from "../../utils/httpReplyError";
import {
  unitAttributionService,
  listUnitsOfProductionEligibleAssets,
} from "../services/unitAttributionService";
import type { UnitAttributionPeriodType } from "../../constants/unitAttribution";

function replyError(res: Response, error: unknown): boolean {
  if (error instanceof HttpReplyError) {
    res.status(error.statusCode).json(outJson(false, error.message, null));
    return true;
  }
  return false;
}

function paramId(req: IRequest): string {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  return id!;
}

export const createUnitAttribution = async (req: IRequest, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const body = matchedData(req, {
      locations: ["body"],
      includeOptionals: true,
    }) as {
      assetId: string;
      productName: string;
      brandName?: string | null;
      skuCode?: string | null;
      description?: string | null;
      unitOfMeasurement: string;
      periodType: UnitAttributionPeriodType;
      administratorName?: string | null;
      factoryPlantName?: string | null;
      department?: string | null;
      branchLocation?: string | null;
    };
    const data = await unitAttributionService.create(userId, body);
    res
      .status(HttpStatusCode.CREATED)
      .json(outJson(true, "Unit attribution created successfully", data));
  } catch (error) {
    if (replyError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to create unit attribution", null));
  }
};

export const listUnitAttributions = async (
  req: PaginationRequest,
  res: Response,
) => {
  try {
    const userId = getAuthUserId(req);
    const page = req.pagination?.page ?? 1;
    const limit = req.pagination?.limit ?? 20;
    const data = await unitAttributionService.list(userId, page, limit);
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Unit attributions retrieved successfully", data));
  } catch (error) {
    if (replyError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to list unit attributions", null));
  }
};

export const getUnitAttribution = async (req: IRequest, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const data = await unitAttributionService.getById(userId, paramId(req));
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Unit attribution retrieved successfully", data));
  } catch (error) {
    if (replyError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to get unit attribution", null));
  }
};

export const recordUnitAttributionProduction = async (
  req: IRequest,
  res: Response,
) => {
  try {
    const userId = getAuthUserId(req);
    const body = matchedData(req, {
      locations: ["body"],
      includeOptionals: true,
    }) as {
      periodStart: string;
      unitsAttributed: number;
      unitCost?: number | null;
      batchLotNumber?: string | null;
      productionLine?: string | null;
      shift?: string | null;
      locationWarehouse?: string | null;
    };
    const data = await unitAttributionService.recordProduction(
      userId,
      paramId(req),
      body,
    );
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Production units recorded successfully", data));
  } catch (error) {
    if (replyError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to record production units", null));
  }
};

export const getUnitAttributionSchedule = async (
  req: IRequest,
  res: Response,
) => {
  try {
    const userId = getAuthUserId(req);
    const data = await unitAttributionService.getSchedule(userId, paramId(req));
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Production schedule retrieved successfully", data));
  } catch (error) {
    if (replyError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to get production schedule", null));
  }
};

export const listUnitsOfProductionEligible = async (
  req: IRequest,
  res: Response,
) => {
  try {
    const userId = getAuthUserId(req);
    const data = await listUnitsOfProductionEligibleAssets(userId);
    res
      .status(HttpStatusCode.OK)
      .json(
        outJson(
          true,
          "Units of production eligible assets retrieved successfully",
          data,
        ),
      );
  } catch (error) {
    if (replyError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(
        outJson(false, "Failed to list eligible assets", null),
      );
  }
};
