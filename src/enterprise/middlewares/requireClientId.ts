import { NextFunction, Response } from "express";
import { IRequest } from "../../interfaces/CustomRequest";
import { canAccessClient } from "../services/enterpriseManagedEntitiesService";
import { sendNotFound } from "../utils/controllerHelpers";

export function requireClientId(
  req: IRequest,
  res: Response,
  next: NextFunction,
): void {
  const clientId = req.params.clientId as string;
  const consultantUserId = req.user?.id;
  if (!consultantUserId) {
    req.companyId = undefined;
    req.linkedUserId = clientId;
    next();
    return;
  }
  canAccessClient(consultantUserId, clientId)
    .then(({ allowed, companyId, linkedUserId }) => {
      if (!allowed) {
        sendNotFound(res, "Client not found or access denied.");
        return;
      }
      if (!companyId) {
        sendNotFound(res, "Client workspace not found.");
        return;
      }
      req.companyId = companyId;
      req.linkedUserId = linkedUserId;
      req.clientId = clientId;
      next();
    })
    .catch(() => {
      sendNotFound(res, "Client not found or access denied.");
    });
}
