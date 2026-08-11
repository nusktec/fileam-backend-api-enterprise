import { Response } from "express";
import { IRequest } from "../../interfaces/CustomRequest";
import { HttpReplyError } from "../../utils/httpReplyError";
import {
  sendBadRequest,
  sendCreated,
  sendNotFound,
  sendResult,
  sendServerError,
} from "../utils/controllerHelpers";
import {
  enterpriseAssetsService,
  takeDownload,
} from "../services/enterpriseAssetsService";
import { HttpStatusCode } from "../../interfaces/system";

function linkedUserId(req: IRequest): string {
  const id = req.linkedUserId;
  if (!id) throw new HttpReplyError(400, "Client context missing");
  return id;
}

function consultantId(req: IRequest): string {
  const id = req.user?.id;
  if (!id) throw new HttpReplyError(401, "Unauthorized");
  return id;
}

function clientId(req: IRequest): string {
  return req.clientId || linkedUserId(req);
}

function param(req: IRequest, key: string): string {
  const v = req.params[key];
  return Array.isArray(v) ? v[0]! : v!;
}

function replyError(res: Response, error: unknown): boolean {
  if (error instanceof HttpReplyError) {
    if (error.statusCode === 404) {
      sendNotFound(res, error.message);
      return true;
    }
    if (error.statusCode === 422 || error.statusCode === 400) {
      sendBadRequest(res, error.message);
      return true;
    }
    res.status(error.statusCode).json({ status: false, message: error.message });
    return true;
  }
  return false;
}

export async function listPendingAssets(req: IRequest, res: Response) {
  try {
    const status = req.query.status as string | undefined;
    if (
      status &&
      !["pending", "approved", "returned"].includes(status)
    ) {
      sendBadRequest(res, "status must be pending | approved | returned");
      return;
    }
    const data = await enterpriseAssetsService.listPending(linkedUserId(req), {
      status,
    });
    sendResult(res, "Pending assets retrieved", data);
  } catch (e) {
    if (replyError(res, e)) return;
    sendServerError(res, "Failed to list pending assets");
  }
}

export async function getPendingAsset(req: IRequest, res: Response) {
  try {
    const data = await enterpriseAssetsService.getPending(
      linkedUserId(req),
      param(req, "assetId"),
    );
    sendResult(res, "Pending asset retrieved", data);
  } catch (e) {
    if (replyError(res, e)) return;
    sendServerError(res, "Failed to get pending asset");
  }
}

export async function approveAsset(req: IRequest, res: Response) {
  try {
    const data = await enterpriseAssetsService.approve(
      linkedUserId(req),
      clientId(req),
      param(req, "assetId"),
      consultantId(req),
      req.body ?? {},
    );
    sendCreated(res, "Asset approved", data);
  } catch (e) {
    if (replyError(res, e)) return;
    sendServerError(res, "Failed to approve asset");
  }
}

export async function returnAsset(req: IRequest, res: Response) {
  try {
    const data = await enterpriseAssetsService.returnToOwner(
      linkedUserId(req),
      clientId(req),
      param(req, "assetId"),
      consultantId(req),
      req.body?.reason,
    );
    sendResult(res, "Asset returned to owner", data);
  } catch (e) {
    if (replyError(res, e)) return;
    sendServerError(res, "Failed to return asset");
  }
}

export async function expenseAsset(req: IRequest, res: Response) {
  try {
    const data = await enterpriseAssetsService.classifyAsExpense(
      linkedUserId(req),
      clientId(req),
      param(req, "assetId"),
      consultantId(req),
      req.body?.consultant_notes,
    );
    sendResult(res, "Asset classified as expense", data);
  } catch (e) {
    if (replyError(res, e)) return;
    sendServerError(res, "Failed to classify asset as expense");
  }
}

export async function listRegister(req: IRequest, res: Response) {
  try {
    const data = await enterpriseAssetsService.listRegister(
      linkedUserId(req),
      req.query.search as string | undefined,
    );
    sendResult(res, "Asset register retrieved", data);
  } catch (e) {
    if (replyError(res, e)) return;
    sendServerError(res, "Failed to list asset register");
  }
}

export async function getRegisterAsset(req: IRequest, res: Response) {
  try {
    const data = await enterpriseAssetsService.getRegister(
      linkedUserId(req),
      param(req, "assetId"),
    );
    sendResult(res, "Registered asset retrieved", data);
  } catch (e) {
    if (replyError(res, e)) return;
    sendServerError(res, "Failed to get registered asset");
  }
}

export async function patchRegisterAsset(req: IRequest, res: Response) {
  try {
    const data = await enterpriseAssetsService.patchRegister(
      linkedUserId(req),
      clientId(req),
      param(req, "assetId"),
      consultantId(req),
      req.body ?? {},
    );
    sendResult(res, "Registered asset updated", data);
  } catch (e) {
    if (replyError(res, e)) return;
    sendServerError(res, "Failed to update registered asset");
  }
}

export async function exportRegister(req: IRequest, res: Response) {
  try {
    const format = String(req.query.format || "");
    const data = await enterpriseAssetsService.exportRegister(
      linkedUserId(req),
      clientId(req),
      format,
    );
    sendResult(res, "Export ready", data);
  } catch (e) {
    if (replyError(res, e)) return;
    sendServerError(res, "Failed to export register");
  }
}

export async function getDepreciationSchedule(req: IRequest, res: Response) {
  try {
    const data = await enterpriseAssetsService.getDepreciationSchedule(
      linkedUserId(req),
      param(req, "assetId"),
    );
    sendResult(res, "Depreciation schedule retrieved", data);
  } catch (e) {
    if (replyError(res, e)) return;
    sendServerError(res, "Failed to get depreciation schedule");
  }
}

export async function listAssetHistory(req: IRequest, res: Response) {
  try {
    const data = await enterpriseAssetsService.listHistory(linkedUserId(req), {
      asset_id: req.query.asset_id as string | undefined,
      event_type: req.query.event_type as string | undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      per_page: req.query.per_page ? Number(req.query.per_page) : undefined,
    });
    sendResult(res, "Asset history retrieved", data);
  } catch (e) {
    if (replyError(res, e)) return;
    sendServerError(res, "Failed to list asset history");
  }
}

export async function generateAssetReport(req: IRequest, res: Response) {
  try {
    const data = await enterpriseAssetsService.generateReport(
      linkedUserId(req),
      clientId(req),
      req.body ?? {},
    );
    sendResult(res, "Report generated", data);
  } catch (e) {
    if (replyError(res, e)) return;
    sendServerError(res, "Failed to generate report");
  }
}

export async function downloadAssetFile(req: IRequest, res: Response) {
  try {
    const file = takeDownload(param(req, "downloadId"));
    if (!file) {
      sendNotFound(res, "Download expired or not found");
      return;
    }
    res.setHeader("Content-Type", file.contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${file.filename}"`,
    );
    res.status(HttpStatusCode.OK).send(file.buffer);
  } catch {
    sendServerError(res, "Failed to download file");
  }
}
