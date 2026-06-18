-- Phase 1D: additive, nullable billing columns on subscriptions. No data loss.
ALTER TABLE "subscriptions" ADD COLUMN "stripe_price_id" TEXT;
ALTER TABLE "subscriptions" ADD COLUMN "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false;
