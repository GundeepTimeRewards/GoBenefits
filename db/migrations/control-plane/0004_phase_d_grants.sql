-- Phase D (D-2) grant fix. Idempotent (INSERT IGNORE; PK on role_permission).
--
-- The `broker` role was granted `benefit_plan.manage` / `rate.manage` /
-- `contribution.manage` (0002) but NOT the matching READ permissions. The Plans &
-- Rates read resolvers (`planCatalog`, `benefitPlanDetail`) authorize on
-- `benefit_plan.read`, and Plans & Rates is broker-visible (roadmap §10.2), so a broker
-- would be denied. Read/manage permissions must be paired — the SAME co-grant rationale
-- as `plan_year.read` in 0003 and `dependent.read` in 0002. Co-grant the missing READ
-- permissions here rather than editing the already-applied 0002 seed.
--
-- Scope: broker only; read only. No manage/write is added, and no other role is touched.
INSERT IGNORE INTO role_permission (role_id, permission_id)
SELECT r.id, p.id
  FROM role r
  JOIN permission p ON p.key_name IN ('benefit_plan.read', 'rate.read', 'contribution.read')
 WHERE r.key_name = 'broker';
