-- Local TEST fixtures for the control-plane DB. Applied AFTER control-plane
-- migrations + reference seed. Idempotent (fixed UUIDs + ON DUPLICATE / IGNORE).
-- Proves role + scope behavior for the tenant-isolation tests.
SET NAMES utf8mb4;

-- Org -----------------------------------------------------------------------
INSERT INTO agency (id, name) VALUES
  (UUID_TO_BIN('aaaaaaaa-0000-0000-0000-000000000001'), 'Test Agency A')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO broker (id, agency_id, name, email) VALUES
  (UUID_TO_BIN('bbbbbbbb-0000-0000-0000-000000000001'),
   UUID_TO_BIN('aaaaaaaa-0000-0000-0000-000000000001'), 'Broker A', 'broker.a@test')
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- Employer registry (db_name routes to the per-customer DB) -----------------
INSERT INTO employer (id, agency_id, broker_id, legal_name, status, db_name) VALUES
  (UUID_TO_BIN('eeee0000-0000-0000-0000-0000000000a1'),
   UUID_TO_BIN('aaaaaaaa-0000-0000-0000-000000000001'),
   UUID_TO_BIN('bbbbbbbb-0000-0000-0000-000000000001'),
   'Employer A', 'active', 'cust_employer_a'),
  (UUID_TO_BIN('eeee0000-0000-0000-0000-0000000000b2'),
   UUID_TO_BIN('aaaaaaaa-0000-0000-0000-000000000001'),
   NULL,
   'Employer B', 'active', 'cust_employer_b'),
  (UUID_TO_BIN('eeee0000-0000-0000-0000-0000000000c3'),
   UUID_TO_BIN('aaaaaaaa-0000-0000-0000-000000000001'),
   NULL,
   'Employer C (archived)', 'archived', 'cust_employer_c')
ON DUPLICATE KEY UPDATE legal_name = VALUES(legal_name), status = VALUES(status), db_name = VALUES(db_name);

-- Users (role resolved by key; cognito_sub is the test login identity) -------
INSERT INTO user_account (id, cognito_sub, email, role_id, agency_id, broker_id, status)
SELECT UUID_TO_BIN('dddd0000-0000-0000-0000-000000000001'), 'sub-platform', 'platform@test', r.id, NULL, NULL, 'active'
  FROM role r WHERE r.key_name='platform_admin'
ON DUPLICATE KEY UPDATE email=VALUES(email);
INSERT INTO user_account (id, cognito_sub, email, role_id, agency_id, broker_id, status)
SELECT UUID_TO_BIN('dddd0000-0000-0000-0000-000000000002'), 'sub-support', 'support@test', r.id, NULL, NULL, 'active'
  FROM role r WHERE r.key_name='benefits_support_admin'
ON DUPLICATE KEY UPDATE email=VALUES(email);
INSERT INTO user_account (id, cognito_sub, email, role_id, agency_id, broker_id, status)
SELECT UUID_TO_BIN('dddd0000-0000-0000-0000-000000000003'), 'sub-agency', 'agency@test', r.id,
       UUID_TO_BIN('aaaaaaaa-0000-0000-0000-000000000001'), NULL, 'active'
  FROM role r WHERE r.key_name='agency_admin'
ON DUPLICATE KEY UPDATE email=VALUES(email);
INSERT INTO user_account (id, cognito_sub, email, role_id, agency_id, broker_id, status)
SELECT UUID_TO_BIN('dddd0000-0000-0000-0000-000000000004'), 'sub-broker-a', 'broker.a.user@test', r.id,
       UUID_TO_BIN('aaaaaaaa-0000-0000-0000-000000000001'),
       UUID_TO_BIN('bbbbbbbb-0000-0000-0000-000000000001'), 'active'
  FROM role r WHERE r.key_name='broker'
ON DUPLICATE KEY UPDATE email=VALUES(email);
INSERT INTO user_account (id, cognito_sub, email, role_id, agency_id, broker_id, status)
SELECT UUID_TO_BIN('dddd0000-0000-0000-0000-000000000005'), 'sub-emp-admin-a', 'hr.a@test', r.id, NULL, NULL, 'active'
  FROM role r WHERE r.key_name='employer_admin'
ON DUPLICATE KEY UPDATE email=VALUES(email);
INSERT INTO user_account (id, cognito_sub, email, role_id, agency_id, broker_id, status)
SELECT UUID_TO_BIN('dddd0000-0000-0000-0000-000000000006'), 'sub-emp-admin-b', 'hr.b@test', r.id, NULL, NULL, 'active'
  FROM role r WHERE r.key_name='employer_admin'
ON DUPLICATE KEY UPDATE email=VALUES(email);
INSERT INTO user_account (id, cognito_sub, email, role_id, agency_id, broker_id, status)
SELECT UUID_TO_BIN('dddd0000-0000-0000-0000-000000000007'), 'sub-employee-a', 'emp.a@test', r.id, NULL, NULL, 'active'
  FROM role r WHERE r.key_name='employee'
ON DUPLICATE KEY UPDATE email=VALUES(email);
-- disabled user (employer_admin scoped to A but status=disabled -> fails closed)
INSERT INTO user_account (id, cognito_sub, email, role_id, agency_id, broker_id, status)
SELECT UUID_TO_BIN('dddd0000-0000-0000-0000-000000000008'), 'sub-disabled', 'disabled@test', r.id, NULL, NULL, 'disabled'
  FROM role r WHERE r.key_name='employer_admin'
ON DUPLICATE KEY UPDATE status=VALUES(status);

-- Scope grants (user_employer_access) ---------------------------------------
-- Broker A -> Employer A ONLY (not B), proving book-of-business scoping.
INSERT IGNORE INTO user_employer_access (user_account_id, employer_id) VALUES
  (UUID_TO_BIN('dddd0000-0000-0000-0000-000000000004'), UUID_TO_BIN('eeee0000-0000-0000-0000-0000000000a1')),
  (UUID_TO_BIN('dddd0000-0000-0000-0000-000000000005'), UUID_TO_BIN('eeee0000-0000-0000-0000-0000000000a1')),
  (UUID_TO_BIN('dddd0000-0000-0000-0000-000000000006'), UUID_TO_BIN('eeee0000-0000-0000-0000-0000000000b2')),
  (UUID_TO_BIN('dddd0000-0000-0000-0000-000000000007'), UUID_TO_BIN('eeee0000-0000-0000-0000-0000000000a1')),
  (UUID_TO_BIN('dddd0000-0000-0000-0000-000000000008'), UUID_TO_BIN('eeee0000-0000-0000-0000-0000000000a1'));
