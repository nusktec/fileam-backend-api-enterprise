import { Response } from "express";
import { matchedData } from "express-validator";
import { IRequest } from "../../interfaces/CustomRequest";
import {
  sendNotFound,
  sendResult,
  sendServerError,
} from "../utils/controllerHelpers";
import { enterpriseBusinessProfileService } from "../services/enterpriseBusinessProfileService";

interface UpdateBusinessProfileBody {
  companyName: string;
  businessType: string;
  industry: string;
  tin: string;
  businessAddress: string;
  phoneNumber: string;
  emailAddress: string;
  website: string;
  logo?: string;
  registrationDate?: string;
}

export async function getBusinessProfile(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = req.companyId!;
  const userId = req.user?.id;
  try {
    const profile =
      await enterpriseBusinessProfileService.getProfile(companyId, userId);
    if (!profile) {
      sendNotFound(res, "Company not found");
      return;
    }
    sendResult(res, "Business profile", profile);
  } catch {
    sendServerError(res, "Failed to get profile");
  }
}

export async function getBusinessProfileActivities(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = req.companyId!;
  try {
    const activities =
      await enterpriseBusinessProfileService.getActivities(companyId);
    sendResult(res, "Compliance activities", activities);
  } catch {
    sendServerError(res, "Failed to get activities");
  }
}

export async function updateBusinessProfile(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = req.companyId!;
  const data = matchedData(req, {
    locations: ["body"],
    includeOptionals: true,
  }) as UpdateBusinessProfileBody;

  const registrationDate = data.registrationDate
    ? new Date(data.registrationDate)
    : new Date();
  const logo =
    data.logo !== undefined ? (data.logo === "" ? null : data.logo) : undefined;

  try {
    const profile = await enterpriseBusinessProfileService.updateProfile(
      companyId,
      {
        companyName: data.companyName,
        businessType: data.businessType,
        industry: data.industry,
        registrationDate,
        tin: data.tin,
        businessAddress: data.businessAddress,
        phoneNumber: data.phoneNumber,
        emailAddress: data.emailAddress,
        website: data.website,
        ...(logo !== undefined && { logo }),
      },
    );
    if (!profile) {
      sendNotFound(res, "Company not found");
      return;
    }
    sendResult(res, "Profile updated", profile);
  } catch {
    sendServerError(res, "Failed to update profile");
  }
}

export async function upgradeSubscription(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = req.companyId!;
  const data = matchedData(req, {
    locations: ["body"],
    includeOptionals: true,
  });
  const plan = typeof data.plan === "string" ? data.plan : undefined;
  try {
    const profile = await enterpriseBusinessProfileService.upgradeSubscription(
      companyId,
      plan,
    );
    if (!profile) {
      sendNotFound(res, "Profile not found");
      return;
    }
    sendResult(res, "Subscription upgrade initiated", profile);
  } catch {
    sendServerError(res, "Failed to upgrade subscription");
  }
}

export async function getBusinessTypes(
  _req: IRequest,
  res: Response,
): Promise<void> {
  try {
    const types = enterpriseBusinessProfileService.getBusinessTypes();
    sendResult(res, "Business types", types);
  } catch {
    sendServerError(res, "Failed to get business types");
  }
}

export async function getIndustries(
  _req: IRequest,
  res: Response,
): Promise<void> {
  try {
    const industries = enterpriseBusinessProfileService.getIndustries();
    sendResult(res, "Industries", industries);
  } catch {
    sendServerError(res, "Failed to get industries");
  }
}
