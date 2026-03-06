import { Response } from "express";
import { IRequest } from "../../interfaces/CustomRequest";
import {
  sendResult,
  sendBadRequest,
  sendServerError,
  sendNotFound,
} from "../utils/controllerHelpers";
import { enterpriseClientsService } from "../services/enterpriseClientsService";
import { prisma } from "../../config/database";

async function resolveCompanyId(userId: string): Promise<string | null> {
  const company = await prisma.company.findFirst({
    where: { ownerId: userId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return company?.id ?? null;
}

export async function listClients(
  req: IRequest,
  res: Response,
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    sendBadRequest(res, "Authentication required.");
    return;
  }
  const companyId = await resolveCompanyId(userId);
  if (!companyId) {
    sendNotFound(res, "No company found. Create a company first.");
    return;
  }
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
  const userId = req.user?.id;
  if (!userId) {
    sendBadRequest(res, "Authentication required.");
    return;
  }
  const q = (req.query.q as string) ?? "";
  if (!q || q.trim().length < 2) {
    sendBadRequest(res, "Query q is required and must be at least 2 characters");
    return;
  }
  const companyId = await resolveCompanyId(userId);
  if (!companyId) {
    sendNotFound(res, "No company found. Create a company first.");
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
