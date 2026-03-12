-- CreateEnum
CREATE TYPE "ConsultantConnectionStatus" AS ENUM ('active', 'pending', 'revoked');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('pending', 'accepted', 'rejected');

-- AlterTable: Preserve existing data by casting
ALTER TABLE "invitations" 
  ALTER COLUMN "status" TYPE "InvitationStatus" 
  USING status::"InvitationStatus",
  ALTER COLUMN "status" SET DEFAULT 'pending';

ALTER TABLE "consultant_connections" 
  ALTER COLUMN "status" TYPE "ConsultantConnectionStatus" 
  USING (
    CASE 
      WHEN status IN ('active', 'pending', 'revoked') THEN status::"ConsultantConnectionStatus"
      ELSE 'active'::"ConsultantConnectionStatus"
    END
  ),
  ALTER COLUMN "status" SET DEFAULT 'active';
