-- ============================================================================
-- Extensions
-- ============================================================================
-- vector: stores embeddings for RAG (RFP chunks, contractor past performance)
-- pg_trgm: fuzzy/trigram text matching, useful for department name normalization
-- pgcrypto: gen_random_uuid() (built-in to modern Postgres but ensure available)
-- ============================================================================

create extension if not exists "vector";
create extension if not exists "pg_trgm";
create extension if not exists "pgcrypto";
