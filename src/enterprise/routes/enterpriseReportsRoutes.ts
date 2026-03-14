import express from "express";
import { listReportsHandler } from "../controllers/enterpriseReportsController";

const router = express.Router({ mergeParams: true });

router.get("/", listReportsHandler);

export default router;
