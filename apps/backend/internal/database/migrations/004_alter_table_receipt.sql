ALTER TABLE receipt_files
    ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TRIGGER trg_receipt_files_updated_at
    BEFORE UPDATE ON receipt_files
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

---- create above / drop below ----

DROP TRIGGER IF EXISTS trg_receipt_files_updated_at ON receipt_files;
ALTER TABLE receipt_files DROP COLUMN IF EXISTS updated_at;
