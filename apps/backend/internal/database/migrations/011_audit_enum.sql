CREATE TYPE audit_decision AS ENUM ('approved', 'flagged', 'rejected');

---- create above / drop below ----

DROP TYPE IF EXISTS audit_decision;
