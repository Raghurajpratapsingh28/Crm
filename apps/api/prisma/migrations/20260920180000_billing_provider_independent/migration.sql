-- Billing: provider-independent plans, subscription history, webhook processing.

ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'TRIALING';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'UNPAID';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'PAUSED';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';

ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'FAILED';

CREATE TYPE "BillingInterval" AS ENUM ('MONTH', 'YEAR');
CREATE TYPE "PaymentEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_ACTIVATED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_RENEWED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_CANCELED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_PAST_DUE';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PAYMENT_FAILED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'INVOICE_AVAILABLE';

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'BILLING_CHECKOUT_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_CANCELED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_REACTIVATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PAYMENT_SUCCEEDED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PAYMENT_FAILED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'INVOICE_PAID';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'INVOICE_FAILED';

CREATE TABLE "billing_plans" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "currency" CHAR(3) NOT NULL,
    "monthly_price" DECIMAL(14,2) NOT NULL,
    "yearly_price" DECIMAL(14,2) NOT NULL,
    "stripe_price_id_month" TEXT,
    "stripe_price_id_year" TEXT,
    "razorpay_plan_id_month" TEXT,
    "razorpay_plan_id_year" TEXT,
    "features" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "entitlement" "Plan" NOT NULL DEFAULT 'STARTER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_plans_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "billing_plans_key_key" ON "billing_plans"("key");
CREATE INDEX "billing_plans_active_idx" ON "billing_plans"("active");

ALTER TABLE "subscriptions" DROP CONSTRAINT IF EXISTS "subscriptions_organization_id_key";
ALTER TABLE "subscriptions" DROP CONSTRAINT IF EXISTS "subscriptions_organization_id_fkey";

ALTER TABLE "subscriptions"
    ADD COLUMN "plan_id" UUID,
    ADD COLUMN "billing_interval" "BillingInterval" NOT NULL DEFAULT 'MONTH',
    ADD COLUMN "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "canceled_at" TIMESTAMP(3),
    ADD COLUMN "trial_start" TIMESTAMP(3),
    ADD COLUMN "trial_end" TIMESTAMP(3);

ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_organization_id_fkey";
ALTER TABLE "invoices"
    ADD COLUMN "subscription_id" UUID,
    ADD COLUMN "invoice_number" TEXT,
    ADD COLUMN "invoice_url" TEXT,
    ADD COLUMN "pdf_url" TEXT,
    ADD COLUMN "period_start" TIMESTAMP(3),
    ADD COLUMN "period_end" TIMESTAMP(3),
    ADD COLUMN "due_at" TIMESTAMP(3),
    ADD COLUMN "paid_at" TIMESTAMP(3);

ALTER TABLE "payment_events" DROP CONSTRAINT IF EXISTS "payment_events_organization_id_fkey";
ALTER TABLE "payment_events" ALTER COLUMN "organization_id" DROP NOT NULL;
ALTER TABLE "payment_events"
    ADD COLUMN "subscription_id" UUID,
    ADD COLUMN "invoice_id" UUID,
    ADD COLUMN "payload_hash" TEXT,
    ADD COLUMN "status" "PaymentEventStatus" NOT NULL DEFAULT 'RECEIVED',
    ADD COLUMN "failed_at" TIMESTAMP(3),
    ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "last_error" TEXT;

CREATE TABLE "billing_checkouts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "plan_id" UUID NOT NULL,
    "billing_interval" "BillingInterval" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "checkout_url" TEXT,
    "session_id" TEXT,
    "response" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_checkouts_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "subscriptions"
    ADD CONSTRAINT "subscriptions_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "subscriptions"
    ADD CONSTRAINT "subscriptions_plan_id_fkey"
    FOREIGN KEY ("plan_id") REFERENCES "billing_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "invoices"
    ADD CONSTRAINT "invoices_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "invoices"
    ADD CONSTRAINT "invoices_subscription_id_fkey"
    FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payment_events"
    ADD CONSTRAINT "payment_events_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_events"
    ADD CONSTRAINT "payment_events_subscription_id_fkey"
    FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payment_events"
    ADD CONSTRAINT "payment_events_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "billing_checkouts"
    ADD CONSTRAINT "billing_checkouts_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "subscriptions_provider_provider_subscription_id_key"
    ON "subscriptions"("provider", "provider_subscription_id");
CREATE INDEX "subscriptions_organization_id_status_idx" ON "subscriptions"("organization_id", "status");
CREATE INDEX "subscriptions_status_current_period_end_idx" ON "subscriptions"("status", "current_period_end");

-- One open subscription per organization (history rows may be CANCELED/EXPIRED).
CREATE UNIQUE INDEX "subscriptions_one_open_per_org"
    ON "subscriptions"("organization_id")
    WHERE "status" IN ('INCOMPLETE', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'UNPAID', 'PAUSED');

CREATE INDEX "invoices_organization_id_created_at_idx" ON "invoices"("organization_id", "created_at");
CREATE INDEX "invoices_subscription_id_idx" ON "invoices"("subscription_id");
CREATE INDEX "payment_events_subscription_id_idx" ON "payment_events"("subscription_id");
CREATE INDEX "payment_events_status_created_at_idx" ON "payment_events"("status", "created_at");
CREATE UNIQUE INDEX "billing_checkouts_organization_id_idempotency_key_key"
    ON "billing_checkouts"("organization_id", "idempotency_key");
CREATE INDEX "billing_checkouts_organization_id_created_at_idx" ON "billing_checkouts"("organization_id", "created_at");
