import express from "express";
import { getFaqs, getAbout, submitContact } from "../controllers/helpController";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";

const router = express.Router();

router.get("/faqs", getFaqs);
router.get("/about", getAbout);
router.post("/contact", authenticate(), requireOnboardingComplete, express.json(), submitContact);

export default router;
