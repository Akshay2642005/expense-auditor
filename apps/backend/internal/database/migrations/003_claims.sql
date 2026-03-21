CREATE TABLE claims (
    id               UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          TEXT             NOT NULL,
    receipt_file_id  UUID             NOT NULL REFERENCES receipt_files(id),
    business_purpose TEXT             NOT NULL,
    claimed_date     DATE             NOT NULL,
    expense_category expense_category NOT NULL,
    status           claim_status     NOT NULL DEFAULT 'pending',
    merchant_name    TEXT,
    receipt_date     DATE,
    amount           NUMERIC(12, 2),
    currency         CHAR(3),
    ocr_raw_json     JSONB,
    date_mismatch    BOOLEAN          NOT NULL DEFAULT FALSE,
    ocr_error        TEXT,
    created_at       TIMESTAMPTZ      NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ      NOT NULL DEFAULT now()
);

CREATE INDEX idx_claims_user_id ON claims (user_id);
CREATE INDEX idx_claims_status  ON claims (status);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

CREATE TRIGGER trg_claims_updated_at
    BEFORE UPDATE ON claims
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

---- create above / drop below ----

DROP TRIGGER  IF EXISTS trg_claims_updated_at ON claims;
DROP FUNCTION IF EXISTS update_updated_at_column();
DROP INDEX    IF EXISTS idx_claims_status;
DROP INDEX    IF EXISTS idx_claims_user_id;
DROP TABLE    IF EXISTS claims;
