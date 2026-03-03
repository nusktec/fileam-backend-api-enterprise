-- AlterTable companies: add owner_id for consultant's company
ALTER TABLE "companies" ADD COLUMN "owner_id" TEXT;

-- AlterTable invitations: add Invite New fields
ALTER TABLE "invitations" ADD COLUMN "invited_contact_name" TEXT;
ALTER TABLE "invitations" ADD COLUMN "invited_rc_number" TEXT;
ALTER TABLE "invitations" ADD COLUMN "invited_phone" TEXT;
ALTER TABLE "invitations" ADD COLUMN "state_of_operation" TEXT;
ALTER TABLE "invitations" ADD COLUMN "tax_types_managed" TEXT;

-- AddForeignKey companies.owner_id -> User.id (table name is "User" in this project)
ALTER TABLE "companies" ADD CONSTRAINT "companies_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
