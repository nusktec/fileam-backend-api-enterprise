import express from "express";
import { aiServiceAuth } from "../middlewares/aiServiceAuth";
import { getRecords, updateRecord } from "../controllers/aiRecordsController";

const router = express.Router();

router.use(aiServiceAuth);

router.get("/records", getRecords);
router.patch("/records", updateRecord);

export default router;
