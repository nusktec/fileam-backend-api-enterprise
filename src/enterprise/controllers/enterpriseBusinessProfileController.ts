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
  companyName?: string;
  businessType?: string;
  industry?: string;
  tin?: string;
  businessAddress?: string;
  phoneNumber?: string;
  emailAddress?: string;
  website?: string;
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
      await enterpriseBusinessProfileService.getProfile(
        companyId,
        userId,
        req.linkedUserId,
      );
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

  type ProfileUpdate = Parameters<typeof enterpriseBusinessProfileService.updateProfile>[1];
  const payload: ProfileUpdate = {};
  if (data.companyName !== undefined) payload.companyName = data.companyName;
  if (data.businessType !== undefined) payload.businessType = data.businessType;
  if (data.industry !== undefined) payload.industry = data.industry;
  if (data.tin !== undefined) payload.tin = data.tin;
  if (data.businessAddress !== undefined) payload.businessAddress = data.businessAddress;
  if (data.phoneNumber !== undefined) payload.phoneNumber = data.phoneNumber;
  if (data.emailAddress !== undefined) payload.emailAddress = data.emailAddress;
  if (data.website !== undefined) payload.website = data.website;
  if (data.registrationDate !== undefined) payload.registrationDate = new Date(data.registrationDate);
  if (data.logo !== undefined) payload.logo = data.logo === "" ? null : data.logo;

  try {
    const profile = await enterpriseBusinessProfileService.updateProfile(
      companyId,
      payload,
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
