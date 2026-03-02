import express from "express";
import {
  login,
  refreshToken,
  logout,
  forgotPassword,
  resetPassword,
  resendForgotPassword,
} from "../controllers/authController";
import { validations } from "../../middlewares/validations/authValidation";

const router = express.Router();

router.post("/login", validations.validateLoginRequest, login);
router.post(
  "/forgot-password",
  validations.validateForgotPasswordRequest,
  forgotPassword,
);
router.post(
  "/forgot-password/resend",
  validations.validateForgotPasswordRequest,
  resendForgotPassword,
);
router.post(
  "/reset-password",
  validations.validateResetPasswordRequest,
  resetPassword,
);
router.post("/refresh", validations.validateRefreshTokenRequest, refreshToken);
router.post("/logout", validations.validateLogoutRequest, logout);

export default router;
