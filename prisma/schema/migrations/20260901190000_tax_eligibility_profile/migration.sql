-- Tax eligibility profile fields (professional services + primary activity).
ALTER TABLE "businesses" ADD COLUMN "provides_professional_services" TEXT;
ALTER TABLE "businesses" ADD COLUMN "primary_business_activity" TEXT;
