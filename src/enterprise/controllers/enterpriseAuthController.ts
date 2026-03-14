import { Request, Response } from "express";
import { IRequest } from "../../interfaces/CustomRequest";
import { getAuthUserId } from "../../utils/authHelpers";
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
import { userService } from "../../mobile/services/userService";
import { EmailVerificationService } from "../../services/emailVerificationService";
import { prisma } from "../../config/database";
import { generateConsultantOnboardingToken } from "../../utils/consultantOnboardingToken";
import type { Prisma } from "@prisma/client";

const ENTERPRISE_FIRST_STEP = "company_creation";

async function getConsultantOnboardingTokenForUser(
  userId: string,
): Promise<string | null> {
  const session = await prisma.consultantOnboardingSession.findFirst({
    where: { userId } as Prisma.ConsultantOnboardingSessionWhereInput,
    orderBy: { updatedAt: "desc" },
  });
  return session ? generateConsultantOnboardingToken(session.id) : null;
}

export const login = async (req: Request, res: Response): Promise<void> => {
  const data = matchedData(req, { locations: ["body"] }) as {
    email: string;
    password: string;
  };

  try {
    const user = await authService.findUserByEmail(data.email);
    if (!user) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "User not found", null));
      return;
    }

    const isMatch = await authService.validatePassword(
      data.password,
      user.password,
    );
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
    const enterpriseComplete =
      (user as { enterpriseOnboardingComplete?: boolean })
        .enterpriseOnboardingComplete ?? false;
    const rawStep = (user as { enterpriseOnboardingStep?: string | null })
      .enterpriseOnboardingStep;
    const enterpriseStep = enterpriseComplete
      ? "complete"
      : (rawStep ?? ENTERPRISE_FIRST_STEP);

    const responseData: {
      accessToken: string;
      refreshToken: string;
      user: ReturnType<typeof authService.buildAuthUserPayload>;
      enterpriseOnboardingComplete: boolean;
      enterpriseOnboardingStep: string;
      onboardingToken?: string;
      consultantOnboardingToken?: string;
    } = {
      accessToken,
      refreshToken,
      user: payload,
      enterpriseOnboardingComplete: enterpriseComplete,
      enterpriseOnboardingStep: enterpriseStep,
    };
    if (!enterpriseComplete) {
      const consultantToken = await getConsultantOnboardingTokenForUser(
        user.id,
      );
      if (consultantToken)
        responseData.consultantOnboardingToken = consultantToken;
    }

    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Login successful", responseData));
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
  const data = matchedData(req, { locations: ["body"] }) as {
    refreshToken: string;
  };
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
    const u = tokenRecord.user as {
      enterpriseOnboardingComplete?: boolean;
      enterpriseOnboardingStep?: string | null;
    };
    const entComplete = u.enterpriseOnboardingComplete ?? false;
    const rawStep = u.enterpriseOnboardingStep;
    const entStep = entComplete
      ? "complete"
      : (rawStep ?? ENTERPRISE_FIRST_STEP);
    const responseData: {
      accessToken: string;
      refreshToken: string;
      user: ReturnType<typeof authService.buildAuthUserPayload>;
      enterpriseOnboardingComplete: boolean;
      enterpriseOnboardingStep: string;
      onboardingToken?: string;
      consultantOnboardingToken?: string;
    } = {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      user: userPayload,
      enterpriseOnboardingComplete: entComplete,
      enterpriseOnboardingStep: entStep,
    };
    if (!entComplete) {
      const consultantToken = await getConsultantOnboardingTokenForUser(
        tokenRecord.user.id,
      );
      if (consultantToken)
        responseData.consultantOnboardingToken = consultantToken;
    }
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Token refreshed", responseData));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Server error", null));
  }
};

export const forgotPassword = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const data = matchedData(req, { locations: ["body"] }) as { email: string };
    const { email } = data;

    const user = await authService.findUserByEmail(email);
    if (!user) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "User with this email does not exist", null));
      return;
    }

    const result = await EmailVerificationService.generateAndSendPasswordReset(
      email,
      user.firstName,
    );

    if (result.success) {
      res.status(HttpStatusCode.OK).json(
        outJson(true, "Password reset code sent to your email.", {
          message: "Check your email for the reset code",
          expiresIn: "10 minutes",
        }),
      );
    } else {
      res
        .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
        .json(
          outJson(false, result.message ?? "Failed to send reset code", null),
        );
    }
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Server error", null));
  }
};

export const resendForgotPassword = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const data = matchedData(req, { locations: ["body"] }) as { email: string };
    const { email } = data;

    const user = await authService.findUserByEmail(email);
    if (!user) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "User with this email does not exist", null));
      return;
    }

    const result = await EmailVerificationService.generateAndSendPasswordReset(
      email,
      user.firstName,
    );

    if (result.success) {
      res.status(HttpStatusCode.OK).json(
        outJson(true, "Password reset code resent to your email.", {
          message: "Check your email for the reset code",
          expiresIn: "10 minutes",
        }),
      );
    } else {
      res
        .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
        .json(
          outJson(false, result.message ?? "Failed to resend reset code", null),
        );
    }
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Server error", null));
  }
};

export const resetPassword = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const data = matchedData(req, { locations: ["body"] }) as {
      email: string;
      code: string;
      newPassword: string;
    };
    const { email, code, newPassword } = data;

    const user = await authService.findUserByEmail(email);
    if (!user) {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(outJson(false, "Invalid or expired reset code.", null));
      return;
    }

    const result = await EmailVerificationService.verifyPasswordResetCode(
      email,
      code,
    );
    if (!result.success) {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(outJson(false, result.message, null));
      return;
    }

    await authService.updatePasswordByEmail(email, newPassword);

    res
      .status(HttpStatusCode.OK)
      .json(
        outJson(
          true,
          "Password reset successfully. You can now log in with your new password.",
          null,
        ),
      );
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Server error", null));
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
        .json(outJson(false, result.message, null));
      return;
    }
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Password changed successfully", null));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Server error", null));
  }
};
