CREATE TABLE audit_decisions (
    id                 UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id           UUID           NOT NULL REFERENCES claims(id),
    decision           audit_decision NOT NULL,
    reason             TEXT           NOT NULL,
    cited_policy_text  TEXT,
    confidence         NUMERIC(3,2)   NOT NULL DEFAULT 0,
    ai_model           TEXT           NOT NULL DEFAULT '',
    deterministic_rule TEXT,
    overridden_by      TEXT,
    override_reason    TEXT,
    created_at         TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_decisions_claim_id ON audit_decisions (claim_id);

---- create above / drop below ----

DROP INDEX  IF EXISTS idx_audit_decisions_claim_id;
DROP TABLE  IF EXISTS audit_decisions;
