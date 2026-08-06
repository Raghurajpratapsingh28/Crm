-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'TEAM_MEMBER_JOINED';
ALTER TYPE "NotificationType" ADD VALUE 'MEMBER_ROLE_CHANGED';
ALTER TYPE "NotificationType" ADD VALUE 'MEMBER_STATUS_CHANGED';

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'INVITATION_RESENT';
ALTER TYPE "AuditAction" ADD VALUE 'INVITATION_CANCELLED';
ALTER TYPE "AuditAction" ADD VALUE 'MEMBER_JOINED';
ALTER TYPE "AuditAction" ADD VALUE 'MEMBER_DEPARTMENT_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'OWNERSHIP_TRANSFERRED';

-- CreateTable
CREATE TABLE "organization_invitations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "department" "Department",
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "invited_by" UUID NOT NULL,
    "last_sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "send_count" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_invitations_token_hash_key" ON "organization_invitations"("token_hash");

-- CreateIndex
CREATE INDEX "organization_invitations_organization_id_email_idx" ON "organization_invitations"("organization_id", "email");

-- CreateIndex
CREATE INDEX "organization_invitations_organization_id_expires_at_idx" ON "organization_invitations"("organization_id", "expires_at");

-- One pending invitation per org + email
CREATE UNIQUE INDEX "organization_invitations_org_email_pending_key"
ON "organization_invitations" ("organization_id", "email")
WHERE "accepted_at" IS NULL AND "cancelled_at" IS NULL;

-- CreateIndex
CREATE INDEX "organization_members_organization_id_department_idx" ON "organization_members"("organization_id", "department");

-- AddForeignKey
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
