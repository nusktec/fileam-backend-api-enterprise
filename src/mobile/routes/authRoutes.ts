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
import { validations } from "../../middlewares/validations/authValidation";

const router = express.Router();

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
router.post(
  "/resend-verification",
  validations.validateEmailVerificationRequest,
  resendVerificationEmail
);
router.post("/login", validations.validateLoginRequest, login);
router.post(
  "/register-business",
  validations.registerUserValidation,
  registerBusiness
);
router.post("/register", validations.registerUserValidation, register);
router.post("/refresh", validations.validateRefreshTokenRequest, refreshToken);
router.post("/logout", validations.validateLogoutRequest, logout);

export default router;
