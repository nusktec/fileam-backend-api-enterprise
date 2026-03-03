import { Response } from "express";
import { IRequest } from "../../interfaces/CustomRequest";
import {
  sendResult,
  sendBadRequest,
  sendServerError,
} from "../utils/controllerHelpers";
import { enterpriseClientsService } from "../services/enterpriseClientsService";

export async function listClients(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = req.companyId!;
  try {
    const clients = await enterpriseClientsService.listClients(companyId);
    sendResult(res, "Clients", clients);
  } catch {
    sendServerError(res, "Failed to list clients");
  }
}

export async function searchClients(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = req.companyId!;
  const q = (req.query.q as string) ?? "";
  if (!q || q.trim().length < 2) {
    sendBadRequest(res, "Query q is required and must be at least 2 characters");
    return;
  }
  try {
    const results = await enterpriseClientsService.searchExistingBusinesses(
      companyId,
      q.trim(),
    );
    sendResult(res, "Search results", results);
  } catch {
    sendServerError(res, "Failed to search clients");
  }
}
