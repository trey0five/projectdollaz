-- Member POSITION — the display identity a platform account never had.
-- The product knows a member's ACCESS role (owner/accountant/viewer) and nothing
-- about their job, so every owner picker in the app listed colleagues by email
-- address. Additive and nullable: existing rows are unaffected, and a school that
-- never fills these in behaves exactly as before.
ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "title" TEXT;

-- Pre-assign the position when inviting; copied onto the membership at redemption.
ALTER TABLE "invitations" ADD COLUMN IF NOT EXISTS "title" TEXT;
