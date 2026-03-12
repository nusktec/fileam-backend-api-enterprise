-- CreateEnum
CREATE TYPE "ConsultantConnectionStatus" AS ENUM ('active', 'pending', 'revoked');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('pending', 'accepted', 'rejected');

-- AlterTable invitations: drop default, change type, set new default
ALTER TABLE "invitations" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "invitations" 
  ALTER COLUMN "status" TYPE "InvitationStatus" 
  USING status::"InvitationStatus";
ALTER TABLE "invitations" ALTER COLUMN "status" SET DEFAULT 'pending'::"InvitationStatus";

-- AlterTable consultant_connections: drop default, change type, set new default
ALTER TABLE "consultant_connections" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "consultant_connections" 
  ALTER COLUMN "status" TYPE "ConsultantConnectionStatus" 
  USING (
    CASE 
      WHEN status IN ('active', 'pending', 'revoked') THEN status::"ConsultantConnectionStatus"
      ELSE 'active'::"ConsultantConnectionStatus"
    END
  );
ALTER TABLE "consultant_connections" ALTER COLUMN "status" SET DEFAULT 'active'::"ConsultantConnectionStatus";
