import express from "express";
import {
  stepEmail,
  stepEmailVerify,
  stepPassword,
} from "../controllers/enterpriseOnboardingController";
import { consultantOnboardingTokenOrAccessToken } from "../middlewares/consultantOnboardingTokenOrAccessToken";

const router = express.Router();

router.post("/step/email", stepEmail);
router.post("/step/email-verify", stepEmailVerify);
router.post(
  "/step/password",
  consultantOnboardingTokenOrAccessToken(),
  stepPassword,
);

export default router;
