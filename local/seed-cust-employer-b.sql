-- Sample employees in Employer B's database. Idempotent (fixed UUIDs).
SET NAMES utf8mb4;
INSERT INTO employee (id, first_name, last_name) VALUES
  (UUID_TO_BIN('b2220000-0000-0000-0000-000000000001'), 'Bob', 'Baker'),
  (UUID_TO_BIN('b2220000-0000-0000-0000-000000000002'), 'Bianca', 'Brooks')
ON DUPLICATE KEY UPDATE last_name = VALUES(last_name);
