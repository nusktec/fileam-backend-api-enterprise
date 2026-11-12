import { Response } from "express";
import { IRequest } from "../../../interfaces/CustomRequest";
import { HttpReplyError } from "../../../utils/httpReplyError";
import { outJson } from "../../../utils/renders";
import { sendResult, sendServerError } from "../../utils/controllerHelpers";
import { featuresSyncService } from "../services/syncService";

function handle(res: Response, error: unknown, fallback: string): void {
  if (error instanceof HttpReplyError) {
    res.status(error.statusCode).json(outJson(false, error.message, null));
    return;
  }
  sendServerError(res, fallback);
}

export async function getSyncStatus(req: IRequest, res: Response): Promise<void> {
  try {
    const data = await featuresSyncService.getStatus(req.linkedUserId!);
    sendResult(res, "Sync status", data);
  } catch (error) {
    handle(res, error, "Failed to get sync status");
  }
}

export async function getSyncActivity(
  req: IRequest,
  res: Response,
): Promise<void> {
  try {
    const data = await featuresSyncService.getActivity(
      req.linkedUserId!,
      req.query.page,
      req.query.limit,
    );
    sendResult(res, "Sync activity", data);
  } catch (error) {
    handle(res, error, "Failed to get sync activity");
  }
}

export async function getSyncConflicts(
  req: IRequest,
  res: Response,
): Promise<void> {
  try {
    const data = await featuresSyncService.getConflicts(req.linkedUserId!);
    sendResult(res, "Sync conflicts", data);
  } catch (error) {
    handle(res, error, "Failed to get sync conflicts");
  }
}

export async function postSyncPull(req: IRequest, res: Response): Promise<void> {
  try {
    const data = await featuresSyncService.pull(req.linkedUserId!);
    sendResult(res, "Sync pull completed", data);
  } catch (error) {
    handle(res, error, "Failed to pull sync");
  }
}
