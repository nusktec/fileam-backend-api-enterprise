import express from "express";
import { getProfile, updateProfile, changePassword } from "../controllers/userController";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";
import { validations } from "../../middlewares/validations/userValidation";

const router = express.Router();

router.get("/profile", authenticate(), requireOnboardingComplete, getProfile);
router.put("/profile", authenticate(), requireOnboardingComplete, validations.updateProfileValidation, updateProfile);
router.patch("/password", authenticate(), requireOnboardingComplete, validations.changePasswordValidation, changePassword);

export default router;
