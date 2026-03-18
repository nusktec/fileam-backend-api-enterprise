import express from "express";
import { getContactsAndTypes } from "../controllers/contactsAndTypesController";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

router.get("/", getContactsAndTypes);

export default router;
