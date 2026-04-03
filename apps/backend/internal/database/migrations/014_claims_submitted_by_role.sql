ALTER TABLE claims
    ADD COLUMN IF NOT EXISTS submitted_by_role TEXT NOT NULL DEFAULT 'org:member';

CREATE INDEX IF NOT EXISTS idx_claims_org_id_submitted_by_role
    ON claims (org_id, submitted_by_role, created_at DESC);

---- create above / drop below ----

DROP INDEX IF EXISTS idx_claims_org_id_submitted_by_role;
ALTER TABLE claims DROP COLUMN IF EXISTS submitted_by_role;
