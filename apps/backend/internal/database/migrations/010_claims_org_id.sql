ALTER TABLE claims
    ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_claims_org_id ON claims (org_id);

---- create above / drop below ----

DROP INDEX IF EXISTS idx_claims_org_id;
ALTER TABLE claims DROP COLUMN IF EXISTS org_id;
