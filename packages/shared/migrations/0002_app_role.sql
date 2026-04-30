-- App role for runtime queries.
--
-- The connection pool logs in as the database owner (e.g. neondb_owner on
-- Neon, which has BYPASSRLS=true and would silently defeat the policies in
-- 0001_rls.sql). At the start of every request the API does:
--
--     BEGIN;
--     SET LOCAL ROLE plot_app;
--     SET LOCAL app.current_user_id = '<uuid>';
--     ...queries...
--     COMMIT;
--
-- plot_app is NOLOGIN (no password is ever needed — only the owner can
-- assume it via SET ROLE) and explicitly NOBYPASSRLS / NOSUPERUSER, so
-- FORCE ROW LEVEL SECURITY actually applies.

DO $$
BEGIN
  CREATE ROLE plot_app WITH NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
EXCEPTION WHEN duplicate_object THEN
  -- Idempotent: harden attributes in case the role pre-existed with looser ones.
  ALTER ROLE plot_app NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
END $$;

-- Owner needs membership in plot_app to SET ROLE to it from the connection.
GRANT plot_app TO CURRENT_USER;

-- Schema + table privileges. plot_app does not own anything; it only reads
-- and writes through the owner's tables.
GRANT USAGE ON SCHEMA public TO plot_app;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA public
  TO plot_app;

GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO plot_app;

-- Future tables created by the owner inherit the same grants automatically.
ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO plot_app;

ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA public
  GRANT USAGE ON SEQUENCES TO plot_app;
