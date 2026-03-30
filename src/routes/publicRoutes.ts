import express from "express";
import { validations } from "../middlewares/validations/authValidation";
import {
  getPublicAccountDeletionReasonCategories,
  requestPublicAccountDeletionByEmail,
} from "../controllers/publicAccountDeletionController";

const router = express.Router();

router.get(
  "/account-deletion/reason-categories",
  getPublicAccountDeletionReasonCategories,
);
router.post(
  "/account-deletion/request",
  express.json(),
  validations.validatePublicAccountDeletionRequest,
  requestPublicAccountDeletionByEmail,
);

export default router;
