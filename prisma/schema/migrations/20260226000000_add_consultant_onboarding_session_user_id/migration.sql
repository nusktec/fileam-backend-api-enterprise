-- AlterTable: add optional user_id to consultant_onboarding_sessions (same pattern as mobile: resolve by access token)
ALTER TABLE "consultant_onboarding_sessions" ADD COLUMN "user_id" TEXT;

-- AddForeignKey
ALTER TABLE "consultant_onboarding_sessions" ADD CONSTRAINT "consultant_onboarding_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
