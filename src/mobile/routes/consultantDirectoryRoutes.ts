import express from "express";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";
import {
  listConsultants,
  requestConsultant,
} from "../controllers/consultantDirectoryController";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

router.get("/", listConsultants);
router.post("/request", express.json(), requestConsultant);

export default router;
