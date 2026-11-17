-- Locks Supabase's public API (the anon and authenticated roles) out of every table in the project.
--
-- This site does not use Supabase's public API. The browser talks to the Laravel API, and Laravel
-- connects to Postgres as the table owner (role `postgres`, which skips row level security).
-- So nothing should be readable or writable with the anon / publishable key.
--
-- An earlier version of this file did the opposite: it granted anon full access to every table and
-- added `USING (true)` policies. If that version was ever run, run this one to undo it.
-- Safe to run more than once. Run it in the Supabase SQL editor.

BEGIN;

-- 1. Remove the old allow-everything policies.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT schemaname, tablename, policyname FROM pg_policies
           WHERE schemaname = 'public' AND policyname = 'app_frontend_all'
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- 2. Row level security on for every table. With no policies, the public API gets no rows.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;

-- 3. Take the privileges away too. This also closes the reporting views, which run as their
--    owner and would otherwise skip row level security.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- 4. Tables created later (by migrations) must not be handed to the public API automatically.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE ALL ON SEQUENCES FROM anon, authenticated;

COMMIT;
