import { Response } from "express";
import { IRequest } from "../../../interfaces/CustomRequest";
import { HttpReplyError } from "../../../utils/httpReplyError";
import { outJson } from "../../../utils/renders";
import {
  sendBadRequest,
  sendResult,
  sendServerError,
} from "../../utils/controllerHelpers";
import { featuresTaxOptimizeJobService } from "../services/taxOptimizeJobService";

export async function startTaxOptimize(
  req: IRequest,
  res: Response,
): Promise<void> {
  try {
    const year = req.body?.year != null ? Number(req.body.year) : undefined;
    const data = await featuresTaxOptimizeJobService.start(
      req.linkedUserId!,
      year,
    );
    sendResult(res, "Tax optimize job started", data);
  } catch (error) {
    if (error instanceof HttpReplyError) {
      res.status(error.statusCode).json(outJson(false, error.message, null));
      return;
    }
    sendServerError(res, "Failed to start tax optimize");
  }
}

export async function pollTaxOptimize(
  req: IRequest,
  res: Response,
): Promise<void> {
  const jobId = String(req.query.jobId ?? req.params.jobId ?? "").trim();
  if (!jobId) {
    sendBadRequest(res, "jobId is required");
    return;
  }
  try {
    const data = await featuresTaxOptimizeJobService.poll(
      req.linkedUserId!,
      jobId,
    );
    sendResult(res, "Tax optimize job status", data);
  } catch (error) {
    if (error instanceof HttpReplyError) {
      res.status(error.statusCode).json(outJson(false, error.message, null));
      return;
    }
    sendServerError(res, "Failed to poll tax optimize");
  }
}
