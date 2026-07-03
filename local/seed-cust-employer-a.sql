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

-- Minimal C1 demo enrichment (Employer A only): a few more employees with employment +
-- contact rows and one dependent, so hybrid-live C1 screens have richer data than the
-- 2 bare seed rows. Kept small on purpose (not a demo-data project). Employer B is left
-- plan-year-less by design (an integration test asserts currentPlanYear is null for B).
INSERT INTO employee (id, first_name, last_name) VALUES
  (UUID_TO_BIN('a1110000-0000-0000-0000-000000000003'), 'Amara', 'Adams'),
  (UUID_TO_BIN('a1110000-0000-0000-0000-000000000004'), 'Andre', 'Ali')
ON DUPLICATE KEY UPDATE last_name = VALUES(last_name);

INSERT INTO employee_employment (employee_id, status, hire_date) VALUES
  (UUID_TO_BIN('a1110000-0000-0000-0000-000000000001'), 'active', '2022-03-01'),
  (UUID_TO_BIN('a1110000-0000-0000-0000-000000000003'), 'active', '2023-06-15'),
  (UUID_TO_BIN('a1110000-0000-0000-0000-000000000004'), 'active', '2024-01-10')
ON DUPLICATE KEY UPDATE status = VALUES(status), hire_date = VALUES(hire_date);

INSERT INTO employee_contact (employee_id, email, cell_phone) VALUES
  (UUID_TO_BIN('a1110000-0000-0000-0000-000000000001'), 'alice@employer-a.test', '555-0101'),
  (UUID_TO_BIN('a1110000-0000-0000-0000-000000000003'), 'amara@employer-a.test', '555-0103')
ON DUPLICATE KEY UPDATE email = VALUES(email), cell_phone = VALUES(cell_phone);

INSERT INTO dependent (id, employee_id, first_name, last_name, relationship, date_of_birth) VALUES
  (UUID_TO_BIN('a3330000-0000-0000-0000-000000000001'),
   UUID_TO_BIN('a1110000-0000-0000-0000-000000000001'), 'Ade', 'Anderson', 'child', '2016-04-02')
ON DUPLICATE KEY UPDATE last_name = VALUES(last_name);
