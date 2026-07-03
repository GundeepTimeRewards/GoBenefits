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

-- ===========================================================================
-- Phase D-2 Plans & Rates fixtures (Employer A, active PY 2026 only). Minimal by
-- design: one medical + one dental plan (both fully set up), one contribution rule,
-- one eligibility class, plan options, and rates — enough to demo planCatalog /
-- benefitPlanDetail live and to light up the plans/rates/contributions checklist
-- steps. Idempotent (fixed UUIDs / unique natural keys). Employer B stays empty.
-- ===========================================================================

-- Eligibility class (uq_elig_class_name is unique).
INSERT INTO eligibility_class (id, name, class_code, min_hours_weekly, waiting_period_days) VALUES
  (UUID_TO_BIN('c1110000-0000-0000-0000-000000000001'), 'Full-Time', 'FT', 30.00, 30)
ON DUPLICATE KEY UPDATE class_code = VALUES(class_code), min_hours_weekly = VALUES(min_hours_weekly),
  waiting_period_days = VALUES(waiting_period_days);

-- Employer contribution rule (uq_contrib_name is unique). Employer pays the larger share.
INSERT INTO contribution_rule (id, name, display_name,
    pct_employee_health, pct_employee_dental, pct_employee_vision,
    pct_dependent_health, pct_dependent_dental, pct_dependent_vision) VALUES
  (UUID_TO_BIN('c2220000-0000-0000-0000-000000000001'), 'standard', 'Standard (percentage of premium)',
    20.00, 25.00, 30.00, 50.00, 50.00, 50.00)
ON DUPLICATE KEY UPDATE display_name = VALUES(display_name),
  pct_employee_health = VALUES(pct_employee_health), pct_employee_dental = VALUES(pct_employee_dental),
  pct_employee_vision = VALUES(pct_employee_vision);

-- Benefit plans for PY 2026 (a2220000-...-0002). Both complete + active.
INSERT INTO benefit_plan (id, plan_year_id, benefit_type_key, carrier_name, plan_name, plan_code,
    subtype, network, hsa_eligible, setup_status, setup_issue_count,
    deductible_single, deductible_family, oop_single, oop_family, pcp_copay, specialist_copay, status) VALUES
  (UUID_TO_BIN('c3330000-0000-0000-0000-000000000001'), UUID_TO_BIN('a2220000-0000-0000-0000-000000000002'),
   'medical', 'UnitedHealthcare', 'UHC Choice Plus PPO', 'UHC-PPO', 'PPO', 'National PPO', 0,
   'complete', 0, 1500.00, 3000.00, 4000.00, 8000.00, '$25 copay', '$50 copay', 'active'),
  (UUID_TO_BIN('c3330000-0000-0000-0000-000000000002'), UUID_TO_BIN('a2220000-0000-0000-0000-000000000002'),
   'dental', 'Guardian', 'Guardian Dental PPO', 'GRD-DEN', 'PPO', 'DentalGuard Preferred', NULL,
   'complete', 0, 50.00, 150.00, NULL, NULL, NULL, NULL, 'active')
ON DUPLICATE KEY UPDATE plan_name = VALUES(plan_name), setup_status = VALUES(setup_status),
  status = VALUES(status), deductible_single = VALUES(deductible_single);

-- Plan options (tie each plan to the Full-Time class → eligibleClasses).
INSERT INTO plan_option (id, benefit_plan_id, name, eligibility_class_id) VALUES
  (UUID_TO_BIN('c4440000-0000-0000-0000-000000000001'), UUID_TO_BIN('c3330000-0000-0000-0000-000000000001'),
   'Standard', UUID_TO_BIN('c1110000-0000-0000-0000-000000000001')),
  (UUID_TO_BIN('c4440000-0000-0000-0000-000000000002'), UUID_TO_BIN('c3330000-0000-0000-0000-000000000002'),
   'Standard', UUID_TO_BIN('c1110000-0000-0000-0000-000000000001'))
ON DUPLICATE KEY UPDATE name = VALUES(name), eligibility_class_id = VALUES(eligibility_class_id);

-- Rates (non-age-banded; all four tiers for medical, EE/family for dental).
INSERT INTO plan_rate (id, benefit_plan_id, plan_option_id, age,
    rate_ee, rate_ee_spouse, rate_ee_child, rate_family, effective_date) VALUES
  (UUID_TO_BIN('c5550000-0000-0000-0000-000000000001'), UUID_TO_BIN('c3330000-0000-0000-0000-000000000001'),
   UUID_TO_BIN('c4440000-0000-0000-0000-000000000001'), NULL, 612.00, 1285.00, 1150.00, 1835.00, '2026-01-01'),
  (UUID_TO_BIN('c5550000-0000-0000-0000-000000000002'), UUID_TO_BIN('c3330000-0000-0000-0000-000000000002'),
   UUID_TO_BIN('c4440000-0000-0000-0000-000000000002'), NULL, 38.00, 72.00, 68.00, 110.00, '2026-01-01')
ON DUPLICATE KEY UPDATE rate_ee = VALUES(rate_ee), rate_family = VALUES(rate_family),
  effective_date = VALUES(effective_date);
