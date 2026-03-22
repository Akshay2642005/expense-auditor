CREATE TYPE policy_status AS ENUM ('pending', 'ingesting', 'active', 'failed', 'archived');

CREATE TABLE policies (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL,
    gcs_path    TEXT        NOT NULL,
    version     TEXT        NOT NULL DEFAULT '',
    status      policy_status NOT NULL DEFAULT 'pending',
    chunk_count INT         NOT NULL DEFAULT 0,
    uploaded_by TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_policies_updated_at
    BEFORE UPDATE ON policies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE policy_chunks (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id   UUID        NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
    chunk_text  TEXT        NOT NULL,
    embedding   vector(768),
    category    TEXT        NOT NULL DEFAULT 'general',
    page_num    INT         NOT NULL DEFAULT 0,
    chunk_index INT         NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_policy_chunks_policy_id ON policy_chunks(policy_id);

-- HNSW index: no minimum row-count requirement (unlike IVFFlat), better for small-medium corpora.
-- Switch to IVFFlat with lists=100 only if chunk count exceeds ~50k.
CREATE INDEX idx_policy_chunks_embedding
    ON policy_chunks
    USING hnsw (embedding vector_cosine_ops);

---- create above / drop below ----

DROP INDEX IF EXISTS idx_policy_chunks_embedding;
DROP INDEX IF EXISTS idx_policy_chunks_policy_id;
DROP TABLE IF EXISTS policy_chunks;
DROP TABLE IF EXISTS policies;
DROP TYPE  IF EXISTS policy_status;
