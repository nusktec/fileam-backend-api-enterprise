-- LTD business profile fields (NGN amounts, optional).
ALTER TABLE "businesses" ADD COLUMN "total_fixed_assets" DECIMAL(14,2);
ALTER TABLE "businesses" ADD COLUMN "annual_gross_turnover" DECIMAL(14,2);
