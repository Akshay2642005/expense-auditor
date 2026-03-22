ALTER TABLE claims
    ADD COLUMN IF NOT EXISTS policy_id          UUID REFERENCES policies(id),
    ADD COLUMN IF NOT EXISTS policy_chunks_used JSONB;

---- create above / drop below ----

ALTER TABLE claims
    DROP COLUMN IF EXISTS policy_id,
    DROP COLUMN IF EXISTS policy_chunks_used;
