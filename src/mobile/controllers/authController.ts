import { Request, Response } from "express";
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
import { authService } from "../services/authService";

export const registerBusiness = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { email, password, firstName, lastName } = req.body;

  try {
    const result = await authService.registerBusiness({
      email,
      password,
      firstName,
      lastName,
    });

    if (!result.success) {
      res.status(HttpStatusCode.CONFLICT).json({ msg: result.message });
      return;
    }

    res.status(HttpStatusCode.CREATED).json({
      msg: "Business account created successfully. Please check your email for verification.",
      data: result.data,
    });
  } catch (error) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json({
      msg: "Error creating business account",
      error,
    });
  }
};

export const register = async (req: Request, res: Response): Promise<void> => {
  const {
    email,
    password,
    firstName,
    lastName,
    organizationName,
    organizationAddress,
    logo,
  } = req.body;

  try {
    const result = await authService.registerUser({
      email,
      password,
      firstName,
      lastName,
      organizationName,
      organizationAddress,
      logo,
    });

    if (!result.success) {
      res.status(HttpStatusCode.CONFLICT).json({ msg: result.message });
      return;
    }

    res.status(HttpStatusCode.CREATED).json({
      msg: "Account created successfully. Please check your email for verification.",
      data: result.data,
    });
  } catch (error) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json({
      msg: "Error creating account",
      error,
    });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  try {
    const user = await authService.findUserByEmail(email);
    if (!user) {
      res.status(HttpStatusCode.NOT_FOUND).json({ msg: "User not found" });
      return;
    }

    const isMatch = await authService.validatePassword(password, user.password);
    if (!isMatch) {
      res.status(HttpStatusCode.UNAUTHORIZED).json({ msg: "Invalid credentials" });
      return;
    }

    if (!user.verified) {
      res.status(HttpStatusCode.FORBIDDEN).json({
        msg: "Kindly verify your email address",
      });
      return;
    }

    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken();
    await saveRefreshToken(user.id, refreshToken);

    const payload = authService.buildAuthUserPayload(user);

    res.status(HttpStatusCode.OK).json({
      accessToken,
      refreshToken,
      user: payload,
    });
  } catch (error) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json({
      msg: "Server error",
      error,
    });
  }
};

export const sendOtpEmail = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { email } = req.body;

    const result = await EmailVerificationService.generateAndSendOtp(
      email,
      email.split("@")[0],
      "otp_request"
    );

    if (result.success) {
      res.status(HttpStatusCode.OK).json(
        outJson(true, "OTP sent successfully", {
          message: "OTP sent to your email",
          expiresIn: "10 minutes",
        })
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
  res: Response
): Promise<void> => {
  try {
    const { email, code } = req.body;

    const result = await EmailVerificationService.verifyOtp(email, code);

    if (!result.success) {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(outJson(false, result.message, null));
      return;
    }

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
        .json(outJson(false, "Email already verified.", null));
      return;
    }

    await authService.setUserVerified(email);
    await EmailVerificationService.sendWelcomeEmail(email, user.firstName);

    res.status(HttpStatusCode.OK).json(
      outJson(true, "Email verified successfully. Welcome email sent.", {
        email,
        verified: true,
        message: "Welcome to Slant Menu!",
      })
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
  res: Response
): Promise<void> => {
  const { refreshToken: token } = req.body;

  if (!token) {
    res.status(HttpStatusCode.BAD_REQUEST).json({
      msg: "Refresh token is required",
    });
    return;
  }

  try {
    const tokenRecord = await authService.findValidRefreshToken(token);

    if (!tokenRecord?.user) {
      res.status(HttpStatusCode.UNAUTHORIZED).json({
        msg: "Invalid or expired refresh token",
      });
      return;
    }

    if (!tokenRecord.user.verified) {
      res.status(HttpStatusCode.FORBIDDEN).json({
        msg: "User account is not verified",
      });
      return;
    }

    const newAccessToken = generateAccessToken(tokenRecord.user.id);
    const newRefreshToken = generateRefreshToken();
    await revokeRefreshToken(token, tokenRecord.user.id);
    await saveRefreshToken(tokenRecord.user.id, newRefreshToken);

    res.status(HttpStatusCode.OK).json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      user: {
        id: tokenRecord.user.id,
        firstName: tokenRecord.user.firstName,
        lastName: tokenRecord.user.lastName,
        email: tokenRecord.user.email,
        verified: tokenRecord.user.verified,
        organizationName: tokenRecord.user.organizationName,
        organizationAddress: tokenRecord.user.organizationAddress,
        logo: tokenRecord.user.logo,
      },
    });
  } catch (error) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json({
      msg: "Server error",
      error,
    });
  }
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  const { refreshToken: token } = req.body;

  if (!token) {
    res.status(HttpStatusCode.BAD_REQUEST).json({
      msg: "Refresh token is required",
    });
    return;
  }

  try {
    const tokenRecord = await authService.findRefreshTokenRecord(token);
    if (tokenRecord?.userId) {
      await revokeRefreshToken(token, tokenRecord.userId);
    }
    res.status(HttpStatusCode.OK).json({ msg: "Logged out successfully" });
  } catch (error) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json({
      msg: "Server error",
      error,
    });
  }
};

export const resendVerificationEmail = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { email } = req.body;

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
      "verification"
    );

    if (result.success) {
      res.status(HttpStatusCode.OK).json(
        outJson(true, "Verification email resent successfully", {
          message: "New verification code sent to your email",
          expiresIn: "10 minutes",
        })
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
