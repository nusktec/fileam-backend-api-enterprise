import express from "express";
import { paymentWebhook } from "../controllers/webhookController";

const router = express.Router();

router.post("/payment", paymentWebhook);

export default router;
