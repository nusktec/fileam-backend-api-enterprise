-- Backfill next_sale_number for users who already have sales (table name is "User")
UPDATE "User" u
SET next_sale_number = sub.next_num
FROM (
  SELECT
    s.user_id,
    COALESCE(MAX(
      CASE
        WHEN s.invoice_number ~ '^[0-9]+$' THEN s.invoice_number::integer
        WHEN s.invoice_number ~ '^INV-[0-9]+$' THEN (regexp_replace(s.invoice_number, '^INV-', ''))::integer
        ELSE 0
      END
    ), 0) + 1 AS next_num
  FROM sales s
  GROUP BY s.user_id
) sub
WHERE u.id = sub.user_id;
