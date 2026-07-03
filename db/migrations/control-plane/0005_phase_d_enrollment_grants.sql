-- Phase D (D-3) grant fix. Idempotent (INSERT IGNORE; PK on role_permission).
--
-- The `broker` role was granted `enrollment.manage` (0002) but NOT `enrollment.read`.
-- The Enrollment Progress / Enrollment Center read resolvers (`enrollmentProgress`,
-- `enrollmentCenter`) authorize on `enrollment.read`, and Enrollment Progress is
-- broker-visible (roadmap §10.2), so a broker would be denied. Read/manage permissions
-- must be paired — the SAME co-grant rationale as `benefit_plan.read` in 0004 and
-- `plan_year.read` in 0003. Co-grant the missing READ permission here rather than
-- editing the already-applied 0002 seed.
--
-- Scope: broker only; read only. No manage/write is added, and no other role is touched.
INSERT IGNORE INTO role_permission (role_id, permission_id)
SELECT r.id, p.id
  FROM role r
  JOIN permission p ON p.key_name = 'enrollment.read'
 WHERE r.key_name = 'broker';
