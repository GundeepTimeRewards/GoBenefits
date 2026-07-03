-- Phase E-1: Elections Review workflow state.
--
-- The review queue needs two pieces of state the enrollment model didn't carry:
-- an open HR request on a submitted election (EOI / dependent documents — the
-- election cannot be approved while one is open), and the note attached when an
-- election is sent back to the employee. Both live ON the election row: they are
-- 1:1 with the election's current review cycle (history/audit stays in audit_log;
-- the Documents module owns the actual request artifacts in Phase E-3).
ALTER TABLE employee_election
  ADD COLUMN review_flag ENUM('none','eoi_requested','docs_requested') NOT NULL DEFAULT 'none',
  ADD COLUMN review_note VARCHAR(512) NULL;
