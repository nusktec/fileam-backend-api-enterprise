-- Structured invoice payments on sales / expenses
-- Shape: { "total": number, "items": [{ "amount": number, "paymentType": "Cash"|"Transfer"|"Card" }] }

ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "invoice_amount_paid" JSONB NOT NULL DEFAULT '{"total":0,"items":[]}';

ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "invoice_amount_paid" JSONB NOT NULL DEFAULT '{"total":0,"items":[]}';
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS';

-- Drop legacy scalar column if an earlier draft migration added it
ALTER TABLE "sales" DROP COLUMN IF EXISTS "invoice_paid_amount";
ALTER TABLE "expenses" DROP COLUMN IF EXISTS "invoice_paid_amount";

-- Backfill settled sales (Cash or already PAID) as a single payment line
UPDATE "sales"
SET "invoice_amount_paid" = jsonb_build_object(
  'total', "total_amount",
  'items', jsonb_build_array(
    jsonb_build_object(
      'amount', "total_amount",
      'paymentType', CASE
        WHEN "payment_type" IN ('Cash', 'Card', 'Transfer') THEN "payment_type"
        ELSE 'Transfer'
      END
    )
  )
)
WHERE ("status" IN ('PAID', 'Paid') OR "payment_type" = 'Cash')
  AND (
    "invoice_amount_paid" IS NULL
    OR "invoice_amount_paid" = '{"total":0,"items":[]}'::jsonb
    OR COALESCE(("invoice_amount_paid"->>'total')::numeric, 0) = 0
  );

-- Existing non-invoice expenses: treat as settled
UPDATE "expenses"
SET "invoice_amount_paid" = jsonb_build_object(
  'total', "total_amount",
  'items', jsonb_build_array(
    jsonb_build_object(
      'amount', "total_amount",
      'paymentType', CASE
        WHEN "payment_type" IN ('Cash', 'Card', 'Transfer') THEN "payment_type"
        ELSE 'Transfer'
      END
    )
  )
),
"status" = 'PAID'
WHERE "payment_type" <> 'Invoice'
  AND (
    "invoice_amount_paid" IS NULL
    OR "invoice_amount_paid" = '{"total":0,"items":[]}'::jsonb
    OR COALESCE(("invoice_amount_paid"->>'total')::numeric, 0) = 0
  );
