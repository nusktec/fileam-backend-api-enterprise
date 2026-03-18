import express from "express";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { uploadSingle, handleUploadError } from "../../middlewares/uploadMiddleware";
import { uploadFile, deleteFile } from "../controllers/enterpriseUploadController";

const router = express.Router();

router.post(
  "/",
  authenticate(),
  uploadSingle,
  handleUploadError,
  uploadFile,
);

router.delete("/", authenticate(), deleteFile);

export default router;
