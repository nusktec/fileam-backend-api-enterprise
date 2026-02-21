import { Response } from "express";
import { outJson } from "../utils/renders";
import { HttpStatusCode } from "../interfaces/system";
import { Request } from "express";
import { paymentRecordsService } from "../mobile/services/paymentRecordsService";
import type { PaymentMethod } from "../constants/taxPayable";

const WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET || "";

function verifyWebhookSecret(req: Request): boolean {
  const secret = req.header("X-Webhook-Secret") || req.body?.secret;
  if (!WEBHOOK_SECRET) return true;
  return secret === WEBHOOK_SECRET;
}

export const paymentWebhook = async (
  req: Request,
  res: Response,
): Promise<void> => {
  if (!verifyWebhookSecret(req)) {
    res
      .status(HttpStatusCode.UNAUTHORIZED)
      .json(outJson(false, "Invalid webhook secret", null));
    return;
  }

  const {
    taxPayableId,
    userId,
    amountPaid,
    externalReference,
    externalPaymentId,
    method,
    status,
    paidAt,
    metadata,
  } = req.body || {};

  if (!taxPayableId || !userId || amountPaid == null) {
    res
      .status(HttpStatusCode.BAD_REQUEST)
      .json(
        outJson(
          false,
          "taxPayableId, userId, and amountPaid are required",
          null,
        ),
      );
    return;
  }

  if (externalReference) {
    const existing =
      await paymentRecordsService.findByExternalReference(externalReference);
    if (existing) {
      res.status(HttpStatusCode.OK).json(
        outJson(true, "Payment already recorded (idempotent)", {
          id: existing.id,
          externalReference: existing.externalReference,
        }),
      );
      return;
    }
  }

  const record = await paymentRecordsService.createRecord(
    taxPayableId,
    userId,
    {
      amountPaid: Number(amountPaid),
      externalReference: externalReference || undefined,
      externalPaymentId: externalPaymentId || undefined,
      method: (method as PaymentMethod) || "bank_transfer",
      status:
        status === "success" || status === "completed"
          ? "completed"
          : "pending",
      paidAt: paidAt ? new Date(paidAt) : undefined,
      metadata,
    },
  );

  if (!record) {
    res
      .status(HttpStatusCode.NOT_FOUND)
      .json(outJson(false, "Tax payable not found", null));
    return;
  }

  res
    .status(HttpStatusCode.CREATED)
    .json(outJson(true, "Payment recorded", record));
};
