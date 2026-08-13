-- Which schools an archive actually contains.
-- An org archive is built from the REQUESTER's owned schools, so authorising a
-- download on "caller owns something in this org" let one owner take another
-- owner's schools. The download now requires the caller to own every school in
-- the archive, which needs the archive to say which those are.
ALTER TABLE "data_exports" ADD COLUMN IF NOT EXISTS "school_ids" TEXT[] NOT NULL DEFAULT '{}';
