-- Phase E-3 grant fix. Idempotent (INSERT IGNORE; PK on role_permission).
--
-- `employer_admin` and `broker` were seeded (0002) with `documents.manage` but NOT
-- `documents.read` — the same read/manage pairing gap fixed for dependents (0002
-- note), plan years (0003), and benefit plans (0004). The documentWorkspace read
-- authorizes on the READ permission, so the roles that manage documents could not
-- open the Documents & Forms workspace. Same co-grant approach as 0003–0006.
INSERT IGNORE INTO role_permission (role_id, permission_id)
SELECT r.id, p.id
  FROM role r
  JOIN permission p ON p.key_name = 'documents.read'
 WHERE r.key_name IN ('employer_admin', 'broker');
