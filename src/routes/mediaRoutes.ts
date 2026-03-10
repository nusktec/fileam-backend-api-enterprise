import express from "express";
import { authenticate } from "../middlewares/auth/authMiddleware";
import { uploadSingle, handleUploadError } from "../middlewares/uploadMiddleware";
import { handleValidation } from "../middlewares/errorHandler";
import { uploadMediaValidation } from "../middlewares/validations/mediaValidation";
import {
  uploadMedia,
  getPresignedUrlForView,
  viewMedia,
  deleteMedia,
} from "../controllers/mediaUploadController";

const router = express.Router();

router.get("/view", viewMedia);

router.get("/presigned", authenticate(), getPresignedUrlForView);

router.post(
  "/upload",
  authenticate(),
  uploadSingle,
  handleUploadError,
  uploadMediaValidation,
  handleValidation,
  uploadMedia,
);

router.delete("/", authenticate(), deleteMedia);

export default router;
