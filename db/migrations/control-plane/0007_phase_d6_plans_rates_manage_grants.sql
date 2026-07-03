-- Phase D-6 grant fix. Idempotent (INSERT IGNORE; PK on role_permission).
--
-- The `employer_admin` role was seeded (0002) with READ-only benefits permissions
-- (`benefit_plan.read` / `rate.read` / `contribution.read`) while `broker` holds the
-- manage set. The Plans & Rates mutations (`addPlan`, `duplicatePlan`, `importRates`,
-- `updateContributionRule`) authorize on the MANAGE permissions, and Plans & Rates is
-- an employer_admin surface with those actions (API_ROADMAP §10.2) — an HR admin
-- would be denied their own screen's buttons. Same co-grant approach as 0003–0006
-- (see 0006 for the plan_year.manage precedent). employer_read_only intentionally
-- stays read-only.
INSERT IGNORE INTO role_permission (role_id, permission_id)
SELECT r.id, p.id
  FROM role r
  JOIN permission p ON p.key_name IN ('benefit_plan.manage', 'rate.manage', 'contribution.manage')
 WHERE r.key_name = 'employer_admin';
