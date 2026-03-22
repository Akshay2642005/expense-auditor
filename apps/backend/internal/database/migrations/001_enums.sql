CREATE TYPE claim_status AS ENUM (
    'pending',
    'processing',
    'ocr_complete',
    'needs_review',
    'ocr_failed',
    'auditing',
    'approved',
    'flagged',
    'rejected'
);

CREATE TYPE expense_category AS ENUM (
    'meals',
    'transport',
    'lodging',
    'other'
);

---- create above / drop below ----

DROP TYPE IF EXISTS expense_category;
DROP TYPE IF EXISTS claim_status;
