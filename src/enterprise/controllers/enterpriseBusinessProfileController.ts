import { Response } from "express";
import { IRequest } from "../../interfaces/CustomRequest";
import {
  requireCompanyId,
  sendNotFound,
  sendResult,
  sendServerError,
} from "../utils/controllerHelpers";
import { enterpriseBusinessProfileService } from "../services/enterpriseBusinessProfileService";

export async function getBusinessProfile(req: IRequest, res: Response): Promise<void> {
  const companyId = requireCompanyId(req, res);
  if (companyId === null) return;
  try {
    const profile = await enterpriseBusinessProfileService.getProfile(companyId);
    if (!profile) {
      sendNotFound(res, "Company not found");
      return;
    }
    sendResult(res, "Business profile", profile);
  } catch {
    sendServerError(res, "Failed to get profile");
  }
}

export async function getBusinessProfileActivities(req: IRequest, res: Response): Promise<void> {
  const companyId = requireCompanyId(req, res);
  if (companyId === null) return;
  try {
    const activities = await enterpriseBusinessProfileService.getActivities(companyId);
    sendResult(res, "Compliance activities", activities);
  } catch {
    sendServerError(res, "Failed to get activities");
  }
}

export async function updateBusinessProfile(req: IRequest, res: Response): Promise<void> {
  const companyId = requireCompanyId(req, res);
  if (companyId === null) return;
  const body = req.body || {};
  const companyName = body.companyName != null ? String(body.companyName).trim() : "";
  const businessType = body.businessType != null ? String(body.businessType).trim() : "";
  const industry = body.industry != null ? String(body.industry).trim() : "";
  const tin = body.tin != null ? String(body.tin).trim() : "";
  const businessAddress = body.businessAddress != null ? String(body.businessAddress).trim() : "";
  const phoneNumber = body.phoneNumber != null ? String(body.phoneNumber).trim() : "";
  const emailAddress = body.emailAddress != null ? String(body.emailAddress).trim() : "";
  const website = body.website != null ? String(body.website).trim() : "";
  let registrationDate: Date;
  try {
    registrationDate = body.registrationDate ? new Date(body.registrationDate) : new Date();
  } catch {
    registrationDate = new Date();
  }
  try {
    const profile = await enterpriseBusinessProfileService.updateProfile(companyId, {
      companyName,
      businessType,
      industry,
      registrationDate,
      tin,
      businessAddress,
      phoneNumber,
      emailAddress,
      website,
    });
    if (!profile) {
      sendNotFound(res, "Company not found");
      return;
    }
    sendResult(res, "Profile updated", profile);
  } catch {
    sendServerError(res, "Failed to update profile");
  }
}

export async function upgradeSubscription(req: IRequest, res: Response): Promise<void> {
  const companyId = requireCompanyId(req, res);
  if (companyId === null) return;
  const plan = req.body?.plan != null ? String(req.body.plan).trim() : undefined;
  try {
    const profile = await enterpriseBusinessProfileService.upgradeSubscription(companyId, plan);
    if (!profile) {
      sendNotFound(res, "Profile not found");
      return;
    }
    sendResult(res, "Subscription upgrade initiated", profile);
  } catch {
    sendServerError(res, "Failed to upgrade subscription");
  }
}

export async function getBusinessTypes(_req: IRequest, res: Response): Promise<void> {
  try {
    const types = enterpriseBusinessProfileService.getBusinessTypes();
    sendResult(res, "Business types", types);
  } catch {
    sendServerError(res, "Failed to get business types");
  }
}

export async function getIndustries(_req: IRequest, res: Response): Promise<void> {
  try {
    const industries = enterpriseBusinessProfileService.getIndustries();
    sendResult(res, "Industries", industries);
  } catch {
    sendServerError(res, "Failed to get industries");
  }
}
