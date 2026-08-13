-- A participation numerator that stays correct under summation.
-- max(act, sat) answers 'distinct students tested' only WITHIN one school;
-- the org roll-up sums each column before taking the max, which understates a
-- diocese where some schools sit the ACT and others the SAT. Resolving the max
-- per school and summing THAT column is additive at every scope.
ALTER TABLE "period_operational_data" ADD COLUMN IF NOT EXISTS "assessment_tested_count" INTEGER;
