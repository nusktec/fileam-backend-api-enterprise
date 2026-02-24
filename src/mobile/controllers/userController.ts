import { Response } from "express";
import { matchedData } from "express-validator";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { getAuthUserId } from "../../utils/authHelpers";
import { userService } from "../services/userService";

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

    const updated = await userService.updateProfile(userId, {
      firstName: data.firstName,
      lastName: data.lastName,
      address: data.address,
      state: data.state,
      lga: data.lga,
      purpose: data.purpose,
      roleDescription: data.roleDescription,
      teamSize: data.teamSize,
      adminCount: data.adminCount,
      organizationName: data.organizationName,
      organizationAddress: data.organizationAddress,
      logo: data.logo,
    });

    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Profile updated", updated));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to update profile", null));
  }
};

export const changePassword = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const data = matchedData(req, { locations: ["body"] }) as {
      currentPassword: string;
      newPassword: string;
    };
    const result = await userService.changePassword(
      userId,
      data.currentPassword,
      data.newPassword,
    );

    if (!result.success) {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(outJson(false, result.message!, null));
      return;
    }

    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Password changed successfully", null));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to change password", null));
  }
};

export const getBusinessProfile = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const data = await userService.getBusinessProfile(userId);
    if (!data) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "User not found", null));
      return;
    }
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Business profile retrieved", data));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve business profile", null));
  }
};

export const updateBusinessProfile = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const data = await userService.updateBusinessProfile(
      userId,
      req.body ?? {},
    );
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Business profile updated", data));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to update business profile", null));
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
    } = req.body ?? {};
    const data = await userService.updateNotificationSettings(userId, {
      filingReminders,
      payersNotifications,
      complianceUpdates,
      twoFactorEnabled,
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

export const getConsultant = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const data = await userService.getConsultant(userId);
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Consultant retrieved", data));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve consultant", null));
  }
};

export const revokeConsultant = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const connectionId =
      req.body?.connectionId ??
      (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    if (!connectionId) {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(outJson(false, "Connection ID required", null));
      return;
    }
    const ok = await userService.revokeConsultant(userId, connectionId);
    if (!ok) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Consultant connection not found", null));
      return;
    }
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Consultant access revoked", null));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to revoke consultant", null));
  }
};
