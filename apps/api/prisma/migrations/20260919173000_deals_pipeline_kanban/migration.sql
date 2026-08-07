-- CreateEnum
CREATE TYPE "ProbabilitySource" AS ENUM ('STAGE_DEFAULT', 'MANUAL');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'DEAL_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'DEAL_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'DEAL_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'DEAL_OWNER_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'DEAL_STAGE_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'DEAL_WON';
ALTER TYPE "AuditAction" ADD VALUE 'DEAL_LOST';
ALTER TYPE "AuditAction" ADD VALUE 'DEAL_REOPENED';
ALTER TYPE "AuditAction" ADD VALUE 'DEAL_PROBABILITY_CHANGED';

-- AlterTable
ALTER TABLE "pipelines" ADD COLUMN "description" TEXT;
ALTER TABLE "pipelines" ADD COLUMN "is_default" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "pipeline_stages" ADD COLUMN "key" TEXT;
ALTER TABLE "pipeline_stages" ADD COLUMN "probability" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "deals" ADD COLUMN "description" TEXT;
ALTER TABLE "deals" ADD COLUMN "probability_source" "ProbabilitySource";
ALTER TABLE "deals" ADD COLUMN "lost_reason_note" TEXT;
ALTER TABLE "deals" ADD COLUMN "won_at" TIMESTAMP(3);
ALTER TABLE "deals" ADD COLUMN "lost_at" TIMESTAMP(3);

-- Backfill stage probabilities and keys
UPDATE "pipeline_stages" SET "probability" = 10, "key" = 'lead' WHERE lower("name") = 'lead';
UPDATE "pipeline_stages" SET "probability" = 20, "key" = 'contacted' WHERE lower("name") = 'contacted';
UPDATE "pipeline_stages" SET "probability" = 35, "key" = 'qualified' WHERE lower("name") = 'qualified';
UPDATE "pipeline_stages" SET "probability" = 50, "key" = 'meeting' WHERE lower("name") = 'meeting';
UPDATE "pipeline_stages" SET "probability" = 65, "key" = 'proposal' WHERE lower("name") = 'proposal';
UPDATE "pipeline_stages" SET "probability" = 80, "key" = 'negotiation' WHERE lower("name") = 'negotiation';
UPDATE "pipeline_stages" SET "probability" = 100, "key" = 'won' WHERE "is_won" = true;
UPDATE "pipeline_stages" SET "probability" = 0, "key" = 'lost' WHERE "is_lost" = true;

-- Mark first pipeline per org as default
UPDATE "pipelines" p
SET "is_default" = true
FROM (
  SELECT DISTINCT ON ("organization_id") "id"
  FROM "pipelines"
  ORDER BY "organization_id", "created_at" ASC
) first_pipeline
WHERE p."id" = first_pipeline."id";

-- Backfill deal probability from stage when missing
UPDATE "deals" d
SET
  "probability" = s."probability",
  "probability_source" = 'STAGE_DEFAULT'
FROM "pipeline_stages" s
WHERE d."stage_id" = s."id" AND d."probability" IS NULL;

UPDATE "deals" d
SET
  "won_at" = d."updated_at"
FROM "pipeline_stages" s
WHERE d."stage_id" = s."id" AND s."is_won" = true AND d."won_at" IS NULL;

UPDATE "deals" d
SET
  "lost_at" = d."updated_at"
FROM "pipeline_stages" s
WHERE d."stage_id" = s."id" AND s."is_lost" = true AND d."lost_at" IS NULL;

-- CreateTable
CREATE TABLE "deal_stage_history" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "from_stage_id" UUID,
    "to_stage_id" UUID NOT NULL,
    "changed_by_user_id" UUID NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "from_probability" INTEGER,
    "to_probability" INTEGER,

    CONSTRAINT "deal_stage_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pipelines_organization_id_is_default_idx" ON "pipelines"("organization_id", "is_default");

-- CreateIndex
CREATE INDEX "deals_organization_id_pipeline_id_idx" ON "deals"("organization_id", "pipeline_id");

-- CreateIndex
CREATE INDEX "deals_organization_id_created_at_idx" ON "deals"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "deals_organization_id_updated_at_idx" ON "deals"("organization_id", "updated_at");

-- CreateIndex
CREATE INDEX "deal_stage_history_organization_id_deal_id_idx" ON "deal_stage_history"("organization_id", "deal_id");

-- CreateIndex
CREATE INDEX "deal_stage_history_deal_id_changed_at_idx" ON "deal_stage_history"("deal_id", "changed_at");

-- AddForeignKey
ALTER TABLE "deal_stage_history" ADD CONSTRAINT "deal_stage_history_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_stage_history" ADD CONSTRAINT "deal_stage_history_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_stage_history" ADD CONSTRAINT "deal_stage_history_from_stage_id_fkey" FOREIGN KEY ("from_stage_id") REFERENCES "pipeline_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_stage_history" ADD CONSTRAINT "deal_stage_history_to_stage_id_fkey" FOREIGN KEY ("to_stage_id") REFERENCES "pipeline_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_stage_history" ADD CONSTRAINT "deal_stage_history_changed_by_user_id_fkey" FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
