import { Response } from "express";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { enterpriseBusinessProfileService } from "../services/enterpriseBusinessProfileService";

export async function getBusinessProfile(req: IRequest, res: Response): Promise<void> {
  const companyId = req.params.companyId;
  if (!companyId) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "companyId required", null));
    return;
  }
  try {
    const profile = await enterpriseBusinessProfileService.getProfile(companyId);
    if (!profile) {
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Company not found", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Business profile", profile));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to get profile", null));
  }
}

export async function getBusinessProfileActivities(req: IRequest, res: Response): Promise<void> {
  const companyId = req.params.companyId;
  if (!companyId) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "companyId required", null));
    return;
  }
  try {
    const activities = await enterpriseBusinessProfileService.getActivities(companyId);
    res.status(HttpStatusCode.OK).json(outJson(true, "Compliance activities", activities));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to get activities", null));
  }
}

export async function updateBusinessProfile(req: IRequest, res: Response): Promise<void> {
  const companyId = req.params.companyId;
  const body = req.body || {};
  if (!companyId) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "companyId required", null));
    return;
  }
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
  if (!companyName || !businessType || !industry || !tin || !businessAddress || !phoneNumber || !emailAddress || !website) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "companyName, businessType, industry, tin, businessAddress, phoneNumber, emailAddress, website required", null));
    return;
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
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Company not found", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Profile updated", profile));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to update profile", null));
  }
}

export async function upgradeSubscription(req: IRequest, res: Response): Promise<void> {
  const companyId = req.params.companyId;
  const plan = req.body?.plan != null ? String(req.body.plan).trim() : undefined;
  if (!companyId) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "companyId required", null));
    return;
  }
  try {
    const profile = await enterpriseBusinessProfileService.upgradeSubscription(companyId, plan);
    if (!profile) {
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Profile not found", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Subscription upgrade initiated", profile));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to upgrade subscription", null));
  }
}

export async function getBusinessTypes(_req: IRequest, res: Response): Promise<void> {
  try {
    const types = enterpriseBusinessProfileService.getBusinessTypes();
    res.status(HttpStatusCode.OK).json(outJson(true, "Business types", types));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to get business types", null));
  }
}

export async function getIndustries(_req: IRequest, res: Response): Promise<void> {
  try {
    const industries = enterpriseBusinessProfileService.getIndustries();
    res.status(HttpStatusCode.OK).json(outJson(true, "Industries", industries));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to get industries", null));
  }
}
