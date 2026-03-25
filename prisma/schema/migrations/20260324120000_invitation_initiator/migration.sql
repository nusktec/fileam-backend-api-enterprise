-- CreateEnum
CREATE TYPE "InvitationInitiator" AS ENUM ('consultant_to_client', 'client_to_consultant');

-- AlterTable
ALTER TABLE "invitations" ADD COLUMN "initiator" "InvitationInitiator" NOT NULL DEFAULT 'consultant_to_client';
