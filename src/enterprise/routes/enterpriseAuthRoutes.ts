import express from "express";
import {
  login,
  refreshToken,
  forgotPassword,
  resetPassword,
} from "../controllers/enterpriseAuthController";
import { validations } from "../../middlewares/validations/authValidation";

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

export default router;
