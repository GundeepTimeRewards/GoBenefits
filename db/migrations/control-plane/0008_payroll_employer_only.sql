-- Phase E-2b: enforce the recorded product decision (IMPLEMENTATION_STATUS
-- "Product decisions"): "Agencies and brokers do not manage payroll. Payroll is
-- employer-level only." The frontend nav already enforces this; the 0002 seed
-- still granted payroll.read to broker and agency_admin — remove it so the
-- backend fails closed too. employer_admin / employer_payroll_admin keep their
-- payroll grants. Idempotent (DELETE of specific pairs).
DELETE rp FROM role_permission rp
  JOIN role r ON r.id = rp.role_id
  JOIN permission p ON p.id = rp.permission_id
 WHERE r.key_name IN ('broker', 'agency_admin')
   AND p.key_name IN ('payroll.read', 'payroll.manage', 'payroll.export');
