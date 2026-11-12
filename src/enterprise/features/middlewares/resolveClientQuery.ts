import { NextFunction, Response } from "express";
import { IRequest } from "../../../interfaces/CustomRequest";
import { canAccessClient } from "../../services/enterpriseManagedEntitiesService";
import { sendBadRequest, sendNotFound } from "../../utils/controllerHelpers";

/** Resolve `clientId` query/body to company + linked user for feature endpoints. */
export async function resolveClientQuery(
  req: IRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const clientId = String(
    req.query.clientId ?? req.body?.clientId ?? req.params.clientId ?? "",
  ).trim();
  if (!clientId) {
    sendBadRequest(res, "clientId is required");
    return;
  }

  const consultantUserId = req.user?.id;
  if (!consultantUserId) {
    sendNotFound(res, "Client not found or access denied.");
    return;
  }

  try {
    const { allowed, companyId, linkedUserId } = await canAccessClient(
      consultantUserId,
      clientId,
    );
    if (!allowed || !linkedUserId) {
      sendNotFound(res, "Client not found or access denied.");
      return;
    }
    req.clientId = clientId;
    req.linkedUserId = linkedUserId;
    req.companyId = companyId;
    next();
  } catch {
    sendNotFound(res, "Client not found or access denied.");
  }
}
