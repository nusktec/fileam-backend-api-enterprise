-- Ensure structured invoiceAmountPaid JSON exists even if an older
-- 20260805120000 migration only created scalar invoice_paid_amount
-- (or never created either column).

ALTER TABLE "sales"
  ADD COLUMN IF NOT EXISTS "invoice_amount_paid" JSONB NOT NULL DEFAULT '{"total":0,"items":[]}';

ALTER TABLE "expenses"
  ADD COLUMN IF NOT EXISTS "invoice_amount_paid" JSONB NOT NULL DEFAULT '{"total":0,"items":[]}';

ALTER TABLE "expenses"
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS';

-- Copy legacy scalar paid amounts into the JSON shape when present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'invoice_paid_amount'
  ) THEN
    UPDATE "sales"
    SET "invoice_amount_paid" = jsonb_build_object(
      'total', "invoice_paid_amount",
      'items', CASE
        WHEN "invoice_paid_amount" > 0 THEN jsonb_build_array(
          jsonb_build_object(
            'amount', "invoice_paid_amount",
            'paymentType', CASE
              WHEN "payment_type" IN ('Cash', 'Card', 'Transfer') THEN "payment_type"
              ELSE 'Transfer'
            END
          )
        )
        ELSE '[]'::jsonb
      END
    )
    WHERE COALESCE(("invoice_amount_paid"->>'total')::numeric, 0) = 0
      AND "invoice_paid_amount" > 0;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expenses' AND column_name = 'invoice_paid_amount'
  ) THEN
    UPDATE "expenses"
    SET "invoice_amount_paid" = jsonb_build_object(
      'total', "invoice_paid_amount",
      'items', CASE
        WHEN "invoice_paid_amount" > 0 THEN jsonb_build_array(
          jsonb_build_object(
            'amount', "invoice_paid_amount",
            'paymentType', CASE
              WHEN "payment_type" IN ('Cash', 'Card', 'Transfer') THEN "payment_type"
              ELSE 'Transfer'
            END
          )
        )
        ELSE '[]'::jsonb
      END
    )
    WHERE COALESCE(("invoice_amount_paid"->>'total')::numeric, 0) = 0
      AND "invoice_paid_amount" > 0;
  END IF;
END $$;

-- Backfill settled rows that still have an empty JSON paid object
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
  AND COALESCE(("invoice_amount_paid"->>'total')::numeric, 0) = 0;

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
  AND COALESCE(("invoice_amount_paid"->>'total')::numeric, 0) = 0;

-- Drop legacy scalar column if it still exists
ALTER TABLE "sales" DROP COLUMN IF EXISTS "invoice_paid_amount";
ALTER TABLE "expenses" DROP COLUMN IF EXISTS "invoice_paid_amount";
