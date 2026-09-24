import { Response } from "express";
import { matchedData } from "express-validator";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { getAuthUserId } from "../../utils/authHelpers";
import { PaginationRequest } from "../../middlewares/paginationMiddleware";
import { HttpReplyError } from "../../utils/httpReplyError";
import { assetsService } from "../services/assetsService";
import { capitalAllowanceService } from "../services/capitalAllowanceService";
import { assetUndoService } from "../services/assetUndoService";
import type {
  AssetDisposalUndoReason,
  AssetSaleUndoReason,
  AssetTransferUndoReason,
  AssetUndoReason,
} from "../../constants/recordUndo";

function paramId(req: IRequest): string {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  return id!;
}

function replyHttpError(res: Response, error: unknown): boolean {
  if (error instanceof HttpReplyError) {
    res.status(error.statusCode).json(outJson(false, error.message, null));
    return true;
  }
  return false;
}

export const getAssetsSummary = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const data = await assetsService.summary(userId);
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Assets summary retrieved successfully.", data));
  } catch {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to load assets summary", null));
  }
};

export const createAsset = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const data = matchedData(req, {
      locations: ["body"],
      includeOptionals: true,
    }) as {
      assetType: string;
      assetName: string;
      purchaseDate: string;
      purchaseCost: number;
      vendor?: string;
      evidenceUrl?: string;
      depreciationMethod: string;
      usefulLife?: number;
      depreciationRate?: number;
      residualValue: number;
      totalEstimatedUnit?: number;
      unitProduced?: number;
      serialNumber?: string;
      assetLocation?: string;
      additionalNote?: string;
      assignToConsultant?: boolean;
      expenditureType?: string;
      businessUsePercent?: number;
    };
    const asset = await assetsService.create(userId, {
      ...data,
      purchaseCost: Number(data.purchaseCost),
      usefulLife:
        data.usefulLife != null ? Number(data.usefulLife) : undefined,
      expenditureType: String(data.expenditureType),
      businessUsePercent: Number(data.businessUsePercent),
      depreciationRate:
        data.depreciationRate != null ? Number(data.depreciationRate) : undefined,
      residualValue: Number(data.residualValue),
      totalEstimatedUnit:
        data.totalEstimatedUnit != null
          ? Number(data.totalEstimatedUnit)
          : undefined,
      unitProduced:
        data.unitProduced != null ? Number(data.unitProduced) : undefined,
    });
    res
      .status(HttpStatusCode.CREATED)
      .json(outJson(true, "Asset created successfully.", asset));
  } catch (error) {
    if (replyHttpError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to create asset", null));
  }
};

export const updateAsset = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const data = matchedData(req, {
      locations: ["body"],
      includeOptionals: true,
    }) as Record<string, unknown>;
    const keys = Object.keys(data).filter((k) => data[k] !== undefined);
    if (keys.length === 0) {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(outJson(false, "Provide at least one field to update", null));
      return;
    }
    const asset = await assetsService.update(userId, paramId(req), {
      assetType: data.assetType as string | undefined,
      assetName: data.assetName as string | undefined,
      purchaseDate: data.purchaseDate as string | undefined,
      purchaseCost:
        data.purchaseCost != null ? Number(data.purchaseCost) : undefined,
      vendor:
        data.vendor !== undefined ? (data.vendor as string | null) : undefined,
      evidenceUrl:
        data.evidenceUrl !== undefined
          ? (data.evidenceUrl as string | null)
          : undefined,
      depreciationMethod:
        data.depreciationMethod !== undefined
          ? (data.depreciationMethod as string | null)
          : undefined,
      usefulLife:
        data.usefulLife !== undefined
          ? data.usefulLife == null
            ? null
            : Number(data.usefulLife)
          : undefined,
      depreciationRate:
        data.depreciationRate !== undefined
          ? data.depreciationRate == null
            ? null
            : Number(data.depreciationRate)
          : undefined,
      residualValue:
        data.residualValue !== undefined
          ? data.residualValue == null
            ? null
            : Number(data.residualValue)
          : undefined,
      totalEstimatedUnit:
        data.totalEstimatedUnit !== undefined
          ? data.totalEstimatedUnit == null
            ? null
            : Number(data.totalEstimatedUnit)
          : undefined,
      unitProduced:
        data.unitProduced !== undefined
          ? data.unitProduced == null
            ? null
            : Number(data.unitProduced)
          : undefined,
      serialNumber:
        data.serialNumber !== undefined
          ? (data.serialNumber as string | null)
          : undefined,
      assetLocation:
        data.assetLocation !== undefined
          ? (data.assetLocation as string | null)
          : undefined,
      additionalNote:
        data.additionalNote !== undefined
          ? (data.additionalNote as string | null)
          : undefined,
      assignToConsultant:
        data.assignToConsultant !== undefined
          ? Boolean(data.assignToConsultant)
          : undefined,
    });
    if (!asset) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Asset not found", null));
      return;
    }
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Asset updated successfully.", asset));
  } catch (error) {
    if (replyHttpError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to update asset", null));
  }
};

export const listAssets = async (
  req: IRequest & PaginationRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const p = req.pagination;
    const assetType = req.query.assetType as string | undefined;
    const status = req.query.status as string | undefined;
    const data = await assetsService.list(userId, {
      page: p?.page,
      limit: p?.limit,
      assetType,
      status,
    });
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Assets retrieved successfully.", data));
  } catch {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to list assets", null));
  }
};

export const getAssetById = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const asset = await assetsService.getById(userId, paramId(req));
    if (!asset) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Asset not found", null));
      return;
    }
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Asset retrieved successfully.", asset));
  } catch {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to load asset", null));
  }
};

export const getAssetsDashboard = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const data = await assetsService.dashboard(userId);
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Asset dashboard retrieved successfully.", data));
  } catch {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to load assets dashboard", null));
  }
};

export const getExpenditureTypes = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    getAuthUserId(req);
    const data = await capitalAllowanceService.listExpenditureTypes();
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Expenditure types retrieved", data));
  } catch (error) {
    if (error instanceof HttpReplyError) {
      res.status(error.statusCode).json(outJson(false, error.message, null));
      return;
    }
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to load expenditure types", null));
  }
};

export const getCapitalAllowance = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const year = Number(req.query.year);
    if (!Number.isInteger(year)) {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(outJson(false, "year is required", null));
      return;
    }
    const data = await capitalAllowanceService.getSchedule(userId, year);
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Capital allowance schedule", data));
  } catch (error) {
    if (error instanceof HttpReplyError) {
      res.status(error.statusCode).json(outJson(false, error.message, null));
      return;
    }
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to load capital allowance", null));
  }
};

export const getCurrentAssets = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const data = await assetsService.currentAssets(userId);
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Current assets retrieved successfully.", data));
  } catch {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to load current assets", null));
  }
};

export const getNonCurrentAssets = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const data = await assetsService.nonCurrentAssets(userId);
    res
      .status(HttpStatusCode.OK)
      .json(
        outJson(true, "Non-current assets retrieved successfully.", data),
      );
  } catch {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to load non-current assets", null));
  }
};

export const getDepreciationAmortization = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const data = await assetsService.depreciationAmortization(userId);
    res
      .status(HttpStatusCode.OK)
      .json(
        outJson(
          true,
          "Depreciation and amortization retrieved successfully.",
          data,
        ),
      );
  } catch {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to load depreciation", null));
  }
};

export const createAssetTransfer = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const data = matchedData(req, {
      locations: ["body"],
      includeOptionals: true,
    }) as {
      assetId: string;
      transferType: string;
      fromLocation: string;
      toLocation: string;
      transferDate: string;
      reason: string;
    };
    const transfer = await assetsService.createTransfer(userId, data);
    res
      .status(HttpStatusCode.CREATED)
      .json(outJson(true, "Asset transfer created successfully.", transfer));
  } catch (error) {
    if (replyHttpError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to create transfer", null));
  }
};

export const listAssetTransfers = async (
  req: IRequest & PaginationRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const p = req.pagination;
    const status = req.query.status as string | undefined;
    const data = await assetsService.listTransfers(userId, {
      page: p?.page,
      limit: p?.limit,
      status,
    });
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Asset transfers retrieved successfully.", data));
  } catch {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to list transfers", null));
  }
};

export const updateAssetTransfer = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const data = matchedData(req, {
      locations: ["body"],
      includeOptionals: true,
    }) as Record<string, unknown>;
    const keys = Object.keys(data).filter((k) => data[k] !== undefined);
    if (keys.length === 0) {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(outJson(false, "Provide at least one field to update", null));
      return;
    }
    const transfer = await assetsService.updateTransfer(userId, paramId(req), {
      transferType: data.transferType as string | undefined,
      fromLocation: data.fromLocation as string | undefined,
      toLocation: data.toLocation as string | undefined,
      transferDate: data.transferDate as string | undefined,
      reason: data.reason as string | undefined,
    });
    if (!transfer) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Transfer not found", null));
      return;
    }
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Asset transfer updated successfully.", transfer));
  } catch (error) {
    if (replyHttpError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to update transfer", null));
  }
};

export const approveAssetTransfer = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const transfer = await assetsService.approveTransfer(userId, paramId(req));
    if (!transfer) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Transfer not found", null));
      return;
    }
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Asset transfer approved successfully.", transfer));
  } catch (error) {
    if (replyHttpError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to approve transfer", null));
  }
};

export const rejectAssetTransfer = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const transfer = await assetsService.rejectTransfer(userId, paramId(req));
    if (!transfer) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Transfer not found", null));
      return;
    }
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Asset transfer rejected successfully.", transfer));
  } catch (error) {
    if (replyHttpError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to reject transfer", null));
  }
};

export const createAssetSale = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const data = matchedData(req, {
      locations: ["body"],
      includeOptionals: true,
    }) as {
      assetId: string;
      saleDate: string;
      salePrice: number;
      buyer: string;
    };
    const sale = await assetsService.createSale(userId, {
      ...data,
      salePrice: Number(data.salePrice),
    });
    res
      .status(HttpStatusCode.CREATED)
      .json(outJson(true, "Asset sale recorded successfully.", sale));
  } catch (error) {
    if (replyHttpError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to record asset sale", null));
  }
};

export const listAssetSales = async (
  req: IRequest & PaginationRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const p = req.pagination;
    const data = await assetsService.listSales(userId, {
      page: p?.page,
      limit: p?.limit,
      status: req.query.status as string | undefined,
    });
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Asset sales retrieved successfully.", data));
  } catch {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to list asset sales", null));
  }
};

export const createAssetDisposal = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const data = matchedData(req, {
      locations: ["body"],
      includeOptionals: true,
    }) as {
      assetId: string;
      disposalReason: string;
      disposalDate: string;
      note: string;
      evidenceUrl?: string;
    };
    const disposal = await assetsService.createDisposal(userId, data);
    res
      .status(HttpStatusCode.CREATED)
      .json(outJson(true, "Asset disposal recorded successfully.", disposal));
  } catch (error) {
    if (replyHttpError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to record disposal", null));
  }
};

export const listAssetDisposals = async (
  req: IRequest & PaginationRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const p = req.pagination;
    const data = await assetsService.listDisposals(userId, {
      page: p?.page,
      limit: p?.limit,
      status: req.query.status as string | undefined,
    });
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Asset disposals retrieved successfully.", data));
  } catch {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to list disposals", null));
  }
};

export const updateAssetDisposal = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const data = matchedData(req, {
      locations: ["body"],
      includeOptionals: true,
    }) as Record<string, unknown>;
    const keys = Object.keys(data).filter((k) => data[k] !== undefined);
    if (keys.length === 0) {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(outJson(false, "Provide at least one field to update", null));
      return;
    }
    const disposal = await assetsService.updateDisposal(userId, paramId(req), {
      disposalReason: data.disposalReason as string | undefined,
      disposalDate: data.disposalDate as string | undefined,
      note: data.note as string | undefined,
      evidenceUrl:
        data.evidenceUrl !== undefined
          ? (data.evidenceUrl as string | null)
          : undefined,
    });
    if (!disposal) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Disposal not found", null));
      return;
    }
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Asset disposal updated successfully.", disposal));
  } catch (error) {
    if (replyHttpError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to update disposal", null));
  }
};

export const getAssetUndoCheck = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const result = await assetUndoService.getAssetUndoCheck(userId, paramId(req));
    if (!result) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Asset not found", null));
      return;
    }
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Asset undo check", result));
  } catch (error) {
    if (replyHttpError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to check asset undo", null));
  }
};

export const undoAsset = async (req: IRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const body = matchedData(req, { locations: ["body"] }) as { reason: string };
    const result = await assetUndoService.undoAsset(
      userId,
      paramId(req),
      body.reason as AssetUndoReason,
    );
    if (!result) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Asset not found", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Asset undone", result));
  } catch (error) {
    if (replyHttpError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to undo asset", null));
  }
};

export const getAssetSaleUndoCheck = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const result = await assetUndoService.getSaleUndoCheck(userId, paramId(req));
    if (!result) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Asset sale not found", null));
      return;
    }
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Asset sale undo check", result));
  } catch (error) {
    if (replyHttpError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to check asset sale undo", null));
  }
};

export const undoAssetSale = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const body = matchedData(req, { locations: ["body"] }) as { reason: string };
    const result = await assetUndoService.undoSale(
      userId,
      paramId(req),
      body.reason as AssetSaleUndoReason,
    );
    if (!result) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Asset sale not found", null));
      return;
    }
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Asset sale undone", result));
  } catch (error) {
    if (replyHttpError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to undo asset sale", null));
  }
};

export const getAssetDisposalUndoCheck = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const result = await assetUndoService.getDisposalUndoCheck(
      userId,
      paramId(req),
    );
    if (!result) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Asset disposal not found", null));
      return;
    }
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Asset disposal undo check", result));
  } catch (error) {
    if (replyHttpError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to check asset disposal undo", null));
  }
};

export const undoAssetDisposal = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const body = matchedData(req, { locations: ["body"] }) as { reason: string };
    const result = await assetUndoService.undoDisposal(
      userId,
      paramId(req),
      body.reason as AssetDisposalUndoReason,
    );
    if (!result) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Asset disposal not found", null));
      return;
    }
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Asset disposal undone", result));
  } catch (error) {
    if (replyHttpError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to undo asset disposal", null));
  }
};

export const getAssetTransferUndoCheck = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const result = await assetUndoService.getTransferUndoCheck(
      userId,
      paramId(req),
    );
    if (!result) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Asset transfer not found", null));
      return;
    }
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Asset transfer undo check", result));
  } catch (error) {
    if (replyHttpError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to check asset transfer undo", null));
  }
};

export const undoAssetTransfer = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const body = matchedData(req, { locations: ["body"] }) as { reason: string };
    const result = await assetUndoService.undoTransfer(
      userId,
      paramId(req),
      body.reason as AssetTransferUndoReason,
    );
    if (!result) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Asset transfer not found", null));
      return;
    }
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Asset transfer undone", result));
  } catch (error) {
    if (replyHttpError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to undo asset transfer", null));
  }
};
