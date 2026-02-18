import { Response } from "express";
import { outJson } from "../utils/renders";
import { HttpStatusCode } from "../interfaces/system";
import { IRequest } from "../interfaces/CustomRequest";
import { userService } from "../services/userService";

export const getProfile = async (
  req: IRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(HttpStatusCode.UNAUTHORIZED).json(outJson(false, "Unauthorized", null));
      return;
    }

    const profile = await userService.getProfile(userId);
    if (!profile) {
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "User not found", null));
      return;
    }

    res.status(HttpStatusCode.OK).json(outJson(true, "Profile retrieved", profile));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to get profile", null));
  }
};

export const updateProfile = async (
  req: IRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(HttpStatusCode.UNAUTHORIZED).json(outJson(false, "Unauthorized", null));
      return;
    }

    const {
      firstName,
      lastName,
      address,
      state,
      lga,
      purpose,
      roleDescription,
      teamSize,
      adminCount,
      organizationName,
      organizationAddress,
      logo,
    } = req.body;

    const updated = await userService.updateProfile(userId, {
      firstName,
      lastName,
      address,
      state,
      lga,
      purpose,
      roleDescription,
      teamSize,
      adminCount,
      organizationName,
      organizationAddress,
      logo,
    });

    const primaryRole = updated.userRoles?.[0]?.role;
    res.status(HttpStatusCode.OK).json(
      outJson(true, "Profile updated", {
        ...updated,
        role: primaryRole ?? null,
        userRoles: undefined,
      })
    );
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to update profile", null));
  }
};

export const changePassword = async (
  req: IRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(HttpStatusCode.UNAUTHORIZED).json(outJson(false, "Unauthorized", null));
      return;
    }

    const { currentPassword, newPassword } = req.body;
    const result = await userService.changePassword(
      userId,
      currentPassword,
      newPassword
    );

    if (!result.success) {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(outJson(false, result.message!, null));
      return;
    }

    res.status(HttpStatusCode.OK).json(outJson(true, "Password changed successfully", null));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to change password", null));
  }
};
