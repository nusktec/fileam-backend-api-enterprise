import { Request, Response } from "express";
import { matchedData } from "express-validator";
import { outJson } from "../../utils/renders";
import { PrintDebug } from "../../utils/tools";
import { HttpStatusCode } from "../../interfaces/system";
import { EmailVerificationService } from "../../services/emailVerificationService";
import {
  generateAccessToken,
  generateRefreshToken,
  saveRefreshToken,
  revokeRefreshToken,
} from "../../utils/jwt";
import { generateOnboardingToken } from "../../utils/onboardingToken";
import { authService } from "../services/authService";

export const register = async (req: Request, res: Response): Promise<void> => {
  const data = matchedData(req, { locations: ["body"], includeOptionals: true }) as {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    organizationName?: string;
    organizationAddress?: string;
    logo?: string;
  };

  try {
    const result = await authService.registerUser({
      email: data.email,
      password: data.password,
      firstName: data.firstName,
      lastName: data.lastName,
      organizationName: data.organizationName,
      organizationAddress: data.organizationAddress,
      logo: data.logo,
    });

    if (!result.success) {
      res
        .status(HttpStatusCode.CONFLICT)
        .json(outJson(false, result.message, null));
      return;
    }

    res
      .status(HttpStatusCode.CREATED)
      .json(
        outJson(
          true,
          "Account created successfully. Please check your email for verification.",
          result.data,
        ),
      );
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Error creating account", null));
  }
};

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
    const responseData: {
      accessToken: string;
      refreshToken: string;
      user: typeof payload;
      onboardingToken?: string;
      currentOnboardingStep?: string;
    } = {
      accessToken,
      refreshToken,
      user: payload,
    };
    if (!user.onboardingComplete) {
      responseData.onboardingToken = generateOnboardingToken({
        email: user.email,
        acceptedInvitationIds: [],
      });
      responseData.currentOnboardingStep = user.currentOnboardingStep ?? "income_type";
    }

    res.status(HttpStatusCode.OK).json(outJson(true, "Login successful", responseData));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Server error", null));
  }
};

export const sendOtpEmail = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const data = matchedData(req, { locations: ["body"] }) as { email: string };
    const { email } = data;

    const result = await EmailVerificationService.generateAndSendOtp(
      email,
      email.split("@")[0],
      "otp_request",
    );

    if (result.success) {
      res.status(HttpStatusCode.OK).json(
        outJson(true, "OTP sent successfully", {
          message: "OTP sent to your email",
          expiresIn: "10 minutes",
        }),
      );
    } else {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(outJson(false, result.message, null));
    }
  } catch (e) {
    PrintDebug(e);
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "An error has occurred...500ET", null));
  }
};

export const verifyEmail = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const data = matchedData(req, { locations: ["body"] }) as { email: string; code: string };
    const { email, code } = data;

    const user = await authService.findUserByEmail(email);
    if (!user) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(
          outJson(false, "User not found. Complete registration first.", null),
        );
      return;
    }

    if (user.verified) {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(outJson(false, "Email already verified.", null));
      return;
    }

    const result = await EmailVerificationService.verifyOtp(email, code);
    if (!result.success) {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(outJson(false, result.message, null));
      return;
    }

    await authService.setUserVerified(email);
    await EmailVerificationService.sendWelcomeEmail(email, user.firstName);

    res.status(HttpStatusCode.OK).json(
      outJson(true, "Email verified successfully. Welcome email sent.", {
        email,
        verified: true,
        message: "Welcome to file-am!",
      }),
    );
  } catch (error) {
    PrintDebug(error);
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Internal server error.", null));
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

    const userPayload = {
      id: tokenRecord.user.id,
      firstName: tokenRecord.user.firstName,
      lastName: tokenRecord.user.lastName,
      email: tokenRecord.user.email,
      verified: tokenRecord.user.verified,
      organizationName: tokenRecord.user.organizationName,
      organizationAddress: tokenRecord.user.organizationAddress,
      logo: tokenRecord.user.logo,
    };

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

export const logout = async (req: Request, res: Response): Promise<void> => {
  const data = matchedData(req, { locations: ["body"] }) as { refreshToken: string };
  const token = data.refreshToken;

  try {
    const tokenRecord = await authService.findRefreshTokenRecord(token);
    if (tokenRecord?.userId) {
      await revokeRefreshToken(token, tokenRecord.userId);
    }
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Logged out successfully", null));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Server error", null));
  }
};

export const resendVerificationEmail = async (
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
        .json(outJson(false, "User not found.", null));
      return;
    }

    if (user.verified) {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(outJson(false, "Email is already verified.", null));
      return;
    }

    const result = await EmailVerificationService.resendVerification(
      email,
      user.firstName,
      "verification",
    );

    if (result.success) {
      res.status(HttpStatusCode.OK).json(
        outJson(true, "Verification email resent successfully", {
          message: "New verification code sent to your email",
          expiresIn: "10 minutes",
        }),
      );
    } else {
      res
        .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
        .json(outJson(false, result.message, null));
    }
  } catch (error) {
    PrintDebug(error);
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Internal server error.", null));
  }
};
