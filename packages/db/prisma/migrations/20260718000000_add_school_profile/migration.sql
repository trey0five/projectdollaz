-- School Comparison — peer-benchmarking profile fields on the tenant.
-- All nullable, additive, no default, no backfill (mirrors the brand_color columns).
-- schoolType is a plain string validated in the DTO (not a DB enum — cheap migrations).
-- grade_low/grade_high are GradeKey strings (PK3,PK4,K,1..12); size band is derived
-- from PeriodOperationalData.enrollment at read time and never stored.
ALTER TABLE "schools" ADD COLUMN "county" TEXT;
ALTER TABLE "schools" ADD COLUMN "district" TEXT;
ALTER TABLE "schools" ADD COLUMN "school_type" TEXT;
ALTER TABLE "schools" ADD COLUMN "grade_low" TEXT;
ALTER TABLE "schools" ADD COLUMN "grade_high" TEXT;
