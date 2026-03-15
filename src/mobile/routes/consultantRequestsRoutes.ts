import express from "express";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";
import {
  listConsultantRequests,
  acceptConsultantRequest,
  declineConsultantRequest,
} from "../controllers/consultantRequestsController";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

router.get("/", listConsultantRequests);
router.post("/:id/accept", acceptConsultantRequest);
router.post("/:id/decline", declineConsultantRequest);

export default router;
