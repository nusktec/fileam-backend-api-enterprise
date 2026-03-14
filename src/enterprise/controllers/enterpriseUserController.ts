import { Response } from "express";
import { matchedData } from "express-validator";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { getAuthUserId } from "../../utils/authHelpers";
import { userService } from "../../mobile/services/userService";
import { consultantProfileService } from "../services/consultantProfileService";

export const getProfile = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const profile = await userService.getProfile(userId);
    if (!profile) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "User not found", null));
      return;
    }
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Profile retrieved", profile));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to get profile", null));
  }
};

export const updateProfile = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const data = matchedData(req, {
      locations: ["body"],
      includeOptionals: true,
    }) as {
      firstName?: string;
      lastName?: string;
      address?: string;
      state?: string;
      lga?: string;
      purpose?: string;
      roleDescription?: string;
      teamSize?: number;
      adminCount?: number;
      organizationName?: string;
      organizationAddress?: string;
      logo?: string;
    };
    const updated = await userService.updateProfile(userId, data);
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Profile updated", updated));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to update profile", null));
  }
};

export const getConsultantBusiness = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const business = await consultantProfileService.getBusiness(userId);
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Consultant business retrieved", business));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to get consultant business", null));
  }
};

export const updateConsultantBusiness = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const data = matchedData(req, {
      locations: ["body"],
      includeOptionals: true,
    }) as {
      firmName?: string;
      businessStructure?: string;
      registrationType?: string;
      rcNumber?: string | null;
      yearOfIncorporation?: number | null;
      countryOfRegistration?: string;
    };
    const updated = await consultantProfileService.updateBusiness(userId, data);
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Consultant business updated", updated));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to update consultant business", null));
  }
};

export const getNotificationSettings = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const data = await userService.getNotificationSettings(userId);
    if (!data) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "User not found", null));
      return;
    }
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Notification settings retrieved", data));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve notification settings", null));
  }
};

export const updateNotificationSettings = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const {
      filingReminders,
      payersNotifications,
      complianceUpdates,
      twoFactorEnabled,
      taxDeadline,
      filingConfirmations,
      weeklySummary,
    } = req.body ?? {};
    const data = await userService.updateNotificationSettings(userId, {
      filingReminders,
      payersNotifications,
      complianceUpdates,
      twoFactorEnabled,
      taxDeadline,
      filingConfirmations,
      weeklySummary,
    });
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Notification settings updated", data));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to update notification settings", null));
  }
};
