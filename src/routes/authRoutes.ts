import express from "express";
import {
  register,
  login,
  verifyEmail,
  sendOtpEmail,
  registerBusiness,
  resendVerificationEmail,
  refreshToken,
  logout,
} from "../controllers/authController";
import { validations } from "../middlewares/validations/authValidation";

const router = express.Router();

// Email Verification
router.post(
  "/otp/send/email",
  validations.validateEmailVerificationRequest,
  sendOtpEmail
);
router.post(
  "/otp/verify/email",
  validations.validateEmailVerificationOTPRequest,
  verifyEmail
);

// Resend verification email
router.post(
  "/resend-verification",
  validations.validateEmailVerificationRequest,
  resendVerificationEmail
);

// Login Route
router.post("/login", validations.validateLoginRequest, login);

// Business Register Route
router.post(
  "/register-business",
  validations.registerUserValidation,
  registerBusiness
);

// User Register
router.post("/register", validations.registerUserValidation, register);

// Refresh Token Route
router.post("/refresh", validations.validateRefreshTokenRequest, refreshToken);

// Logout Route
router.post("/logout", validations.validateLogoutRequest, logout);

export default router;
