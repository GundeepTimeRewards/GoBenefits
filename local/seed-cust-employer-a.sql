-- Sample employees in Employer A's database. Idempotent (fixed UUIDs).
SET NAMES utf8mb4;
INSERT INTO employee (id, first_name, last_name) VALUES
  (UUID_TO_BIN('a1110000-0000-0000-0000-000000000001'), 'Alice', 'Anderson'),
  (UUID_TO_BIN('a1110000-0000-0000-0000-000000000002'), 'Aaron', 'Acosta')
ON DUPLICATE KEY UPDATE last_name = VALUES(last_name);

-- Plan years for Employer A (drives planYears / currentPlanYear + census context).
-- One active (current) + one archived (prior), to prove ordering + current selection.
INSERT INTO plan_year (id, label, year, period_start, period_end, status) VALUES
  (UUID_TO_BIN('a2220000-0000-0000-0000-000000000001'), 'PY 2025', 2025, '2025-01-01', '2025-12-31', 'archived'),
  (UUID_TO_BIN('a2220000-0000-0000-0000-000000000002'), 'PY 2026', 2026, '2026-01-01', '2026-12-31', 'active')
ON DUPLICATE KEY UPDATE label = VALUES(label), status = VALUES(status),
  period_start = VALUES(period_start), period_end = VALUES(period_end);
