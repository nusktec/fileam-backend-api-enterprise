import { Response } from "express";
import { matchedData } from "express-validator";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { getAuthUserId } from "../../utils/authHelpers";
import { teamManagementService } from "../services/teamManagementService";
import { authService } from "../../mobile/services/authService";
import {
  generateAccessToken,
  generateRefreshToken,
  saveRefreshToken,
} from "../../utils/jwt";

export const inviteTeamMember = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const consultantUserId = getAuthUserId(req);
    const data = matchedData(req, { locations: ["body"] }) as {
      name: string;
      email: string;
      role: "admin" | "consultant";
    };
    const result = await teamManagementService.inviteTeamMember(
      consultantUserId,
      data,
    );
    if (!result.success) {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(outJson(false, result.message, null));
      return;
    }
    res
      .status(HttpStatusCode.CREATED)
      .json(outJson(true, "Invitation sent successfully", result.data));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to send invitation", null));
  }
};

export const listTeamInvitations = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const consultantUserId = getAuthUserId(req);
    const result = await teamManagementService.listInvitations(consultantUserId);
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Invitations retrieved", result));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to list invitations", null));
  }
};

export const getTeamInvitationByCode = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const code = (req.query.code as string) || (req.params.code as string);
    const invitation = await teamManagementService.getInvitationByCode(code);
    if (!invitation) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Invalid or expired invitation", null));
      return;
    }
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Invitation details", invitation));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to get invitation", null));
  }
};

export const acceptTeamInvitation = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const data = matchedData(req, { locations: ["body"] }) as {
      code: string;
      password: string;
    };
    const result = await teamManagementService.acceptInvitation(
      data.code,
      data.password,
    );
    if (!result.success) {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(outJson(false, result.message, null));
      return;
    }
    const user = await authService.findUserById(result.data!.userId);
    if (!user) {
      res
        .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
        .json(outJson(false, "Account created but login failed", null));
      return;
    }
    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken();
    await saveRefreshToken(user.id, refreshToken);
    const payload = authService.buildAuthUserPayload(user);
    res.status(HttpStatusCode.OK).json(
      outJson(true, "Invitation accepted. Welcome to the team!", {
        accessToken,
        refreshToken,
        user: payload,
      }),
    );
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to accept invitation", null));
  }
};

export const listTeamMembers = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const consultantUserId = getAuthUserId(req);
    const members = await teamManagementService.listTeamMembers(consultantUserId);
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Team members retrieved", members));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to list team members", null));
  }
};
