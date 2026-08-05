-- Messages get a destination. The inbox existed with exactly one writer (the
-- platform-admin broadcast), and broadcasts have nothing to point at. Assignment
-- notices do: "you now own this initiative" is only useful with a door to it.
-- Additive and nullable — every existing row keeps rendering exactly as it does.
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "link" TEXT;
