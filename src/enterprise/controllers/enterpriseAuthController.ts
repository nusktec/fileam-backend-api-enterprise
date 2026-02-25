import { Request, Response } from "express";
import { matchedData } from "express-validator";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import {
  generateAccessToken,
  generateRefreshToken,
  saveRefreshToken,
  revokeRefreshToken,
} from "../../utils/jwt";
import { authService } from "../../mobile/services/authService";

export const login = async (req: Request, res: Response): Promise<void> => {
  const data = matchedData(req, { locations: ["body"] }) as { email: string; password: string };

  try {
    const user = await authService.findUserByEmail(data.email);
    if (!user) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "User not found", null));
      return;
    }

    const isMatch = await authService.validatePassword(data.password, user.password);
    if (!isMatch) {
      res
        .status(HttpStatusCode.UNAUTHORIZED)
        .json(outJson(false, "Invalid credentials", null));
      return;
    }

    if (!user.verified) {
      res
        .status(HttpStatusCode.FORBIDDEN)
        .json(outJson(false, "Kindly verify your email address", null));
      return;
    }

    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken();
    await saveRefreshToken(user.id, refreshToken);

    const payload = authService.buildAuthUserPayload(user);

    res.status(HttpStatusCode.OK).json(
      outJson(true, "Login successful", {
        accessToken,
        refreshToken,
        user: payload,
      }),
    );
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Server error", null));
  }
};

export const refreshToken = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const data = matchedData(req, { locations: ["body"] }) as { refreshToken: string };
  const token = data.refreshToken;

  try {
    const tokenRecord = await authService.findValidRefreshToken(token);

    if (!tokenRecord?.user) {
      res
        .status(HttpStatusCode.UNAUTHORIZED)
        .json(outJson(false, "Invalid or expired refresh token", null));
      return;
    }

    if (!tokenRecord.user.verified) {
      res
        .status(HttpStatusCode.FORBIDDEN)
        .json(outJson(false, "User account is not verified", null));
      return;
    }

    const newAccessToken = generateAccessToken(tokenRecord.user.id);
    const newRefreshToken = generateRefreshToken();
    await revokeRefreshToken(token, tokenRecord.user.id);
    await saveRefreshToken(tokenRecord.user.id, newRefreshToken);

    const userPayload = authService.buildAuthUserPayload(tokenRecord.user);

    res.status(HttpStatusCode.OK).json(
      outJson(true, "Token refreshed", {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        user: userPayload,
      }),
    );
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Server error", null));
  }
};
