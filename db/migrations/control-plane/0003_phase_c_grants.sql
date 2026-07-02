-- Phase C (C1) grant fix. Idempotent (INSERT IGNORE; PK on role_permission).
--
-- The `broker` role was granted `plan_year.manage` (0002) but NOT `plan_year.read`.
-- The plan-year read resolvers (`planYears`, `currentPlanYear`) authorize on the
-- READ permission, and the top-bar Plan Year selector is available to brokers, so a
-- broker would be denied. Read/manage permissions must be paired (same rationale as
-- the `dependent.read` co-grant in 0002 — see IMPLEMENTATION_STATUS.md). Co-grant the
-- matching read permission here rather than editing the already-applied 0002 seed.
INSERT IGNORE INTO role_permission (role_id, permission_id)
SELECT r.id, p.id
  FROM role r
  JOIN permission p ON p.key_name = 'plan_year.read'
 WHERE r.key_name = 'broker';
