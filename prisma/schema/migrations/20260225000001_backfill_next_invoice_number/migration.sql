-- Backfill next_invoice_number for companies that already have invoices,
-- so the next created invoice does not reuse an existing invoice number.
UPDATE companies c
SET next_invoice_number = sub.next_num
FROM (
  SELECT
    inv.company_id,
    COALESCE(MAX(
      CASE
        WHEN inv.invoice_number ~ '^[0-9]+$' THEN inv.invoice_number::integer
        ELSE 0
      END
    ), 0) + 1 AS next_num
  FROM enterprise_invoices inv
  GROUP BY inv.company_id
) sub
WHERE c.id = sub.company_id;
