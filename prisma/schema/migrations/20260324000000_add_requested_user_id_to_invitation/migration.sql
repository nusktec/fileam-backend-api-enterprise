-- AlterTable
ALTER TABLE "invitations" ADD COLUMN "requested_user_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "invitations_requested_user_id_key" ON "invitations"("requested_user_id");

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_requested_user_id_fkey" FOREIGN KEY ("requested_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
