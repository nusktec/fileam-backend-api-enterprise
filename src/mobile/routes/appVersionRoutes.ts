import express from "express";
import { getAppVersion } from "../controllers/appVersionController";
import { appVersionCheckValidation } from "../../middlewares/validations/appVersionValidation";

const router = express.Router();

router.get("/version", appVersionCheckValidation, getAppVersion);

export default router;
