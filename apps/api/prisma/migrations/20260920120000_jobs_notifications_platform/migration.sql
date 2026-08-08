-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DEAL_ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DEAL_WON';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DEAL_LOST';

-- AlterTable jobs
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "max_attempts" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "failed_at" TIMESTAMP(3);
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "request_id" TEXT;

CREATE INDEX IF NOT EXISTS "jobs_status_locked_at_idx" ON "jobs"("status", "locked_at");
CREATE INDEX IF NOT EXISTS "jobs_status_processed_at_idx" ON "jobs"("status", "processed_at");
CREATE INDEX IF NOT EXISTS "jobs_created_at_idx" ON "jobs"("created_at");

-- AlterTable notifications
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "message" TEXT;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "entity_type" TEXT;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "entity_id" TEXT;

CREATE INDEX IF NOT EXISTS "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");
