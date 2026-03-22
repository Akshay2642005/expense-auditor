ALTER TABLE policies
    ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_policies_org_id ON policies (org_id);

---- create above / drop below ----

DROP INDEX IF EXISTS idx_policies_org_id;
ALTER TABLE policies DROP COLUMN IF EXISTS org_id;
