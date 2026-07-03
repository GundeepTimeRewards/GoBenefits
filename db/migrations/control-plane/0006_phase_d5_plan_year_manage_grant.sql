-- Phase D-5 grant fix. Idempotent (INSERT IGNORE; PK on role_permission).
--
-- The `employer_admin` role was seeded (0002) with `plan_year.read` but NOT
-- `plan_year.manage` — while `broker` holds manage. The plan-year lifecycle
-- mutations (`createPlanYear`, `copyFromPriorYear`, `activatePlanYear`,
-- `archivePlanYear`) authorize on the MANAGE permission, and the Plan Years
-- overview ("New Plan Year" / "Copy From Prior Year") is an employer_admin
-- surface (API_ROADMAP §10.2), so an HR admin would be denied their own screen's
-- actions. Same co-grant approach as 0003/0004/0005 rather than editing the
-- already-applied 0002 seed. employer_read_only intentionally stays read-only.
INSERT IGNORE INTO role_permission (role_id, permission_id)
SELECT r.id, p.id
  FROM role r
  JOIN permission p ON p.key_name = 'plan_year.manage'
 WHERE r.key_name = 'employer_admin';
