import { NextFunction, Response } from "express";
import { IRequest } from "../../interfaces/CustomRequest";
import { canAccessCompany } from "../services/enterpriseManagedEntitiesService";
import { sendNotFound } from "../utils/controllerHelpers";

export function requireCompanyId(
  req: IRequest,
  res: Response,
  next: NextFunction,
): void {
  const companyId = req.params.companyId as string;
  const userId = req.user?.id;
  if (!userId) {
    req.companyId = companyId;
    next();
    return;
  }
  req.companyId = companyId;
  canAccessCompany(userId, companyId)
    .then(({ allowed, linkedUserId }) => {
      if (!allowed) {
        sendNotFound(res, "Company not found or access denied.");
        return;
      }
      if (linkedUserId) req.linkedUserId = linkedUserId;
      next();
    })
    .catch(() => {
      sendNotFound(res, "Company not found or access denied.");
    });
}
