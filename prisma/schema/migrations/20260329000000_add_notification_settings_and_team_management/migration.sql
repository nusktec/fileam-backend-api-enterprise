-- AlterTable: Add notification settings to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tax_deadline_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "filing_confirmations_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "weekly_summary_enabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateEnum
CREATE TYPE "TeamMemberRole" AS ENUM ('admin', 'consultant');
CREATE TYPE "TeamMemberInvitationStatus" AS ENUM ('pending', 'accepted', 'expired');

-- CreateTable
CREATE TABLE "team_member_invitations" (
    "id" TEXT NOT NULL,
    "consultant_user_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "TeamMemberRole" NOT NULL,
    "status" "TeamMemberInvitationStatus" NOT NULL DEFAULT 'pending',
    "code" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "accepted_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_member_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultant_team_members" (
    "id" TEXT NOT NULL,
    "consultant_user_id" TEXT NOT NULL,
    "member_user_id" TEXT NOT NULL,
    "role" "TeamMemberRole" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consultant_team_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "team_member_invitations_code_key" ON "team_member_invitations"("code");
CREATE UNIQUE INDEX "consultant_team_members_consultant_user_id_member_user_id_key" ON "consultant_team_members"("consultant_user_id", "member_user_id");

-- AddForeignKey
ALTER TABLE "team_member_invitations" ADD CONSTRAINT "team_member_invitations_consultant_user_id_fkey" FOREIGN KEY ("consultant_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "team_member_invitations" ADD CONSTRAINT "team_member_invitations_accepted_user_id_fkey" FOREIGN KEY ("accepted_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "consultant_team_members" ADD CONSTRAINT "consultant_team_members_consultant_user_id_fkey" FOREIGN KEY ("consultant_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "consultant_team_members" ADD CONSTRAINT "consultant_team_members_member_user_id_fkey" FOREIGN KEY ("member_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
