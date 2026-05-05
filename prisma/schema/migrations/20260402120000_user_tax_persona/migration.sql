-- Mobile tax persona (onboarding UX) + Solopreneur registration branch

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tax_persona" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "solopreneur_registration" TEXT;
