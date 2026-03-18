import { Response } from "express";
import { matchedData } from "express-validator";
import { IRequest } from "../../interfaces/CustomRequest";
import {
  sendNotFound,
  sendResult,
  sendServerError,
} from "../utils/controllerHelpers";
import { clientBusinessProfileService } from "../services/clientBusinessProfileService";
import { getClientDetails } from "../services/clientDetailsService";
import { getClientDashboard } from "../services/clientDashboardService";

export async function putClientBusinessProfile(
  req: IRequest,
  res: Response,
): Promise<void> {
  const linkedUserId = req.linkedUserId!;
  const data = matchedData(req, {
    locations: ["body"],
    includeOptionals: true,
  }) as {
    businessName?: string;
    rcNumber?: string;
    tin?: string;
    industry?: string;
    turnoverBand?: string;
    vatStatus?: string;
  };
  try {
    const business = await clientBusinessProfileService.updateBusinessProfile(
      linkedUserId,
      data,
    );
    if (!business) {
      sendNotFound(res, "Client not found");
      return;
    }
    sendResult(res, "Business profile updated", {
      id: business.id,
      name: business.name,
      rcNumber: business.rcNumber ?? null,
      tin: business.tin ?? null,
      industry: business.sector ?? null,
      turnoverBand: business.turnoverBand ?? null,
      vatStatus: business.vatStatus ?? null,
    });
  } catch {
    sendServerError(res, "Failed to update business profile");
  }
}

export async function putClientContact(
  req: IRequest,
  res: Response,
): Promise<void> {
  const linkedUserId = req.linkedUserId!;
  const data = matchedData(req, {
    locations: ["body"],
    includeOptionals: true,
  }) as {
    address?: string;
    city?: string;
    email?: string;
    phone?: string;
    website?: string;
  };
  try {
    const contact = await clientBusinessProfileService.updateContact(
      linkedUserId,
      data,
    );
    if (!contact) {
      sendNotFound(res, "Client not found");
      return;
    }
    sendResult(res, "Contact updated", contact);
  } catch {
    sendServerError(res, "Failed to update contact");
  }
}

export async function getClientDetailsHandler(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = req.companyId!;
  const linkedUserId = req.linkedUserId!;
  try {
    const details = await getClientDetails(companyId, linkedUserId);
    if (!details) {
      sendNotFound(res, "Client not found");
      return;
    }
    sendResult(res, "Client details", details);
  } catch {
    sendServerError(res, "Failed to get client details");
  }
}

export async function getClientDashboardHandler(
  req: IRequest,
  res: Response,
): Promise<void> {
  const linkedUserId = req.linkedUserId!;
  try {
    const data = await getClientDashboard(linkedUserId);
    if (!data) {
      sendNotFound(res, "Client not found");
      return;
    }
    sendResult(res, "Client dashboard", data);
  } catch {
    sendServerError(res, "Failed to get client dashboard");
  }
}
