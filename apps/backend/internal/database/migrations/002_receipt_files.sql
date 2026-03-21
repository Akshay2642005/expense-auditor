CREATE TABLE receipt_files (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    file_path     TEXT        NOT NULL,
    original_name TEXT        NOT NULL,
    mime_type     TEXT        NOT NULL,
    size_bytes    BIGINT      NOT NULL,
    file_hash     TEXT        NOT NULL,
    gcs_path      TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_receipt_files_file_hash ON receipt_files (file_hash);

---- create above / drop below ----

DROP INDEX IF EXISTS idx_receipt_files_file_hash;
DROP TABLE IF EXISTS receipt_files;
