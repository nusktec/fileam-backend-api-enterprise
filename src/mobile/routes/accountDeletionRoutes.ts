import express from "express";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import {
  getAccountDeletionReasonCategories,
  requestAccountDeletion,
} from "../controllers/accountDeletionController";

const router = express.Router();

router.get("/reason-categories", getAccountDeletionReasonCategories);
router.post(
  "/request",
  authenticate(),
  express.json(),
  requestAccountDeletion,
);

export default router;
