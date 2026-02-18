import express from "express";
import { getProfile, updateProfile, changePassword } from "../controllers/userController";
import { authenticate } from "../middlewares/auth/authMiddleware";
import { validations } from "../middlewares/validations/userValidation";

const router = express.Router();

router.get("/profile", authenticate(), getProfile);
router.put("/profile", authenticate(), validations.updateProfileValidation, updateProfile);
router.patch("/password", authenticate(), validations.changePasswordValidation, changePassword);

export default router;
