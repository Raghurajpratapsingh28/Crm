-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TASK_REMINDER';

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ACTIVITY_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ACTIVITY_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ACTIVITY_DELETED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'TASK_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'TASK_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'TASK_COMPLETED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'TASK_REOPENED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'TASK_ASSIGNED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'TASK_DELETED';

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "completed_at" TIMESTAMP(3);
ALTER TABLE "tasks" ALTER COLUMN "due_date" TYPE TIMESTAMP(3) USING "due_date";

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "dedupe_key" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "notifications_dedupe_key_key" ON "notifications"("dedupe_key");

-- Indexes
CREATE INDEX IF NOT EXISTS "activities_organization_id_author_id_idx" ON "activities"("organization_id", "author_id");
CREATE INDEX IF NOT EXISTS "tasks_organization_id_contact_id_idx" ON "tasks"("organization_id", "contact_id");
CREATE INDEX IF NOT EXISTS "tasks_organization_id_company_id_idx" ON "tasks"("organization_id", "company_id");
CREATE INDEX IF NOT EXISTS "tasks_organization_id_status_idx" ON "tasks"("organization_id", "status");
CREATE INDEX IF NOT EXISTS "tasks_status_due_date_idx" ON "tasks"("status", "due_date");
