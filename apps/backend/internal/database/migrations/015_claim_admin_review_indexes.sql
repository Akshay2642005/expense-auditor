CREATE INDEX IF NOT EXISTS idx_claims_org_role_status_created_at
    ON claims (org_id, submitted_by_role, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_claims_org_role_user_created_at
    ON claims (org_id, submitted_by_role, user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_claims_org_role_claimed_date
    ON claims (org_id, submitted_by_role, claimed_date DESC);

---- create above / drop below ----

DROP INDEX IF EXISTS idx_claims_org_role_claimed_date;
DROP INDEX IF EXISTS idx_claims_org_role_user_created_at;
DROP INDEX IF EXISTS idx_claims_org_role_status_created_at;
