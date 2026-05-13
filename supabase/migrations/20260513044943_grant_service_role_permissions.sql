-- Grant the `service_role` permission to read and write all tables in the
-- public schema. The Supabase service-role API key authenticates as this
-- postgres role, so the ingest pipeline needs these grants to insert rows.
--
-- Idempotent: safe to re-run.

GRANT USAGE ON SCHEMA public TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
    ON ALL TABLES IN SCHEMA public
    TO service_role;

GRANT USAGE, SELECT, UPDATE
    ON ALL SEQUENCES IN SCHEMA public
    TO service_role;

-- Future tables/sequences in `public` automatically inherit these grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO service_role;
