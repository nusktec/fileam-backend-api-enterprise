-- AlterTable
ALTER TABLE "companies" ADD COLUMN "linked_user_id" TEXT,
ADD COLUMN "managed_by_company_id" TEXT;

-- AlterTable
ALTER TABLE "consultant_connections" ADD COLUMN "client_company_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "companies_linked_user_id_key" ON "companies"("linked_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "consultant_connections_client_company_id_key" ON "consultant_connections"("client_company_id");

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_linked_user_id_fkey" FOREIGN KEY ("linked_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_managed_by_company_id_fkey" FOREIGN KEY ("managed_by_company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultant_connections" ADD CONSTRAINT "consultant_connections_client_company_id_fkey" FOREIGN KEY ("client_company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
