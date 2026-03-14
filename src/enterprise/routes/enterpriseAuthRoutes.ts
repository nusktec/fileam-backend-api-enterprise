import express from "express";
import {
  login,
  refreshToken,
  forgotPassword,
  resetPassword,
  resendForgotPassword,
  changePassword,
} from "../controllers/enterpriseAuthController";
import { validations } from "../../middlewares/validations/authValidation";
import { validations as userValidations } from "../../middlewares/validations/userValidation";
import { authenticate } from "../../middlewares/auth/authMiddleware";

const router = express.Router();

router.post("/login", validations.validateLoginRequest, login);
router.post("/refresh", validations.validateRefreshTokenRequest, refreshToken);
router.post(
  "/forgot-password",
  validations.validateForgotPasswordRequest,
  forgotPassword,
);
router.post(
  "/reset-password",
  validations.validateResetPasswordRequest,
  resetPassword,
);
router.post(
  "/forgot-password/resend",
  validations.validateForgotPasswordRequest,
  resendForgotPassword,
);
router.patch(
  "/change-password",
  authenticate(),
  userValidations.changePasswordValidation,
  changePassword,
);

export default router;
