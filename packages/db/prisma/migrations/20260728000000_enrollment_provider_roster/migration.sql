-- Phase 5 — add the `roster` provider (a snapshot DERIVED from the school's own
-- Student roster; carries sourceId=null + a provider stamp, never a source row).
-- Own migration file: Postgres cannot use a newly-added enum value inside the
-- same transaction that added it, so the value lands alone here and the students
-- table (which never references the enum) follows in the next migration.
ALTER TYPE "EnrollmentProvider" ADD VALUE IF NOT EXISTS 'roster';
