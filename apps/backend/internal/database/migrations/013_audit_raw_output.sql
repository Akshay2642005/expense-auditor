-- Migration: 013_add_audit_raw_output.sql
-- Adds a raw_model_output column to audit_decisions to persist the full LLM response
-- This is useful for debugging/troubleshooting parsing/truncation and for audit trails.
-- Note: This column may contain sensitive information. Ensure appropriate access controls and retention policies.

BEGIN;

ALTER TABLE audit_decisions
  ADD COLUMN IF NOT EXISTS raw_model_output TEXT;

COMMIT;

-- Rollback (if necessary):
-- BEGIN;
-- ALTER TABLE audit_decisions
--   DROP COLUMN IF EXISTS raw_model_output;
-- COMMIT;
