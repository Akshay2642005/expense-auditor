-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block.
-- tern wraps migrations in transactions by default, so we opt out here.
-- See: https://pkg.go.dev/github.com/jackc/tern/v2#readme-disabling-transactions
-- Add the following comment to the TOP of this file to disable the transaction:

-- no_transaction

ALTER TYPE claim_status ADD VALUE IF NOT EXISTS 'policy_matched';
