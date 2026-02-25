import express from "express";
import { login, refreshToken } from "../controllers/enterpriseAuthController";
import { validations } from "../../middlewares/validations/authValidation";

const router = express.Router();

router.post("/login", validations.validateLoginRequest, login);
router.post("/refresh", validations.validateRefreshTokenRequest, refreshToken);

export default router;
