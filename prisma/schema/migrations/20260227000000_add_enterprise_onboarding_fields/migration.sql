-- AlterTable
ALTER TABLE "User" ADD COLUMN "enterprise_onboarding_complete" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "enterprise_onboarding_step" TEXT;
