-- Optional timestamp when Card/Transfer sale payment is confirmed
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "payment_confirmed_at" TIMESTAMP(3);
