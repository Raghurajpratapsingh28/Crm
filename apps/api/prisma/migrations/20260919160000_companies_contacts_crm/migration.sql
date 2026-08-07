-- AlterEnum
ALTER TYPE "ContactSource" ADD VALUE 'SOCIAL';
ALTER TYPE "ContactSource" ADD VALUE 'PARTNER';

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'COMPANY_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'COMPANY_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'COMPANY_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'COMPANY_OWNER_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'CONTACT_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'CONTACT_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'CONTACT_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'CONTACT_OWNER_CHANGED';

-- AlterTable
ALTER TABLE "companies" ADD COLUMN "notes" TEXT;

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN "notes" TEXT;

-- Normalize stored emails so the existing unique (organization_id, email) is case-safe.
UPDATE "contacts"
SET "email" = lower(btrim("email"))
WHERE "email" IS NOT NULL;

-- CreateIndex
CREATE INDEX "companies_organization_id_industry_idx" ON "companies"("organization_id", "industry");

-- CreateIndex
CREATE INDEX "companies_organization_id_created_at_idx" ON "companies"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "contacts_organization_id_source_idx" ON "contacts"("organization_id", "source");

-- CreateIndex
CREATE INDEX "contacts_organization_id_created_at_idx" ON "contacts"("organization_id", "created_at");
