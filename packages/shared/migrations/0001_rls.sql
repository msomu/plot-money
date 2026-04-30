-- Row-level security for tenant tables.
--
-- Every protected table gets:
--   1. RLS enabled
--   2. FORCE RLS so the table owner (the app role) is also subject to policies.
--      Without FORCE, the table owner bypasses RLS, which would defeat the
--      entire point of using a single role in v0.1.
--   3. A tenant_isolation policy keyed off `app.current_user_id`, which the
--      API middleware sets via `SET LOCAL` at the start of every request.
--
-- The session GUC is read with `current_setting('app.current_user_id', true)`.
-- Passing `true` makes it return NULL when the GUC is unset, so a forgotten
-- middleware call returns zero rows (fail closed) rather than throwing.
--
-- Better Auth tables (users, sessions, oauth_accounts, verifications) are
-- intentionally left without RLS — Better Auth manages access internally.

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['subscriptions', 'mcp_tokens', 'accounts', 'transactions']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I AS PERMISSIVE FOR ALL '
      'USING (user_id = current_setting(''app.current_user_id'', true)) '
      'WITH CHECK (user_id = current_setting(''app.current_user_id'', true))',
      tbl
    );
  END LOOP;
END $$;
