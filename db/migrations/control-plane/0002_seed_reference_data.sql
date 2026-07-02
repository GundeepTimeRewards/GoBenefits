-- GoBenefits V4 — Control-plane seed / reference data
-- Idempotent: uses stable natural keys (key_name / step_key) + ON DUPLICATE KEY
-- UPDATE / INSERT IGNORE, so this file can be re-run safely.
SET NAMES utf8mb4;

-- ===========================================================================
-- 1. Roles (product-facing names; key_name is the stable code key)
-- ===========================================================================
INSERT INTO role (key_name, label) VALUES
  ('platform_admin',        'Platform Admin'),
  ('agency_admin',          'Agency Admin'),
  ('broker',                'Broker / Producer'),
  ('employer_admin',        'Employer Admin / HR Admin'),
  ('employee',              'Employee'),
  -- future-ready roles
  ('employer_read_only',    'Employer Read Only'),
  ('employer_payroll_admin','Employer Payroll Admin'),
  ('cobra_admin',           'COBRA Admin'),
  ('benefits_support_admin','Benefits Support Admin')
ON DUPLICATE KEY UPDATE label = VALUES(label);

-- ===========================================================================
-- 2. Permission catalog (module.action — stable, code-friendly)
-- ===========================================================================
INSERT INTO permission (key_name, label) VALUES
  ('agency.read','View agencies'),                  ('agency.manage','Manage agencies'),
  ('broker.read','View brokers'),                   ('broker.manage','Manage brokers'),
  ('employer.read','View employers'),               ('employer.create','Create employers'),
  ('employer.update','Update employers'),           ('employer.manage','Manage employers'),
  ('employer_contact.read','View employer contacts'),('employer_contact.manage','Manage employer contacts'),
  ('employee.read','View employees'),               ('employee.create','Create employees'),
  ('employee.update','Update employees'),           ('employee.delete','Delete employees'),
  ('dependent.read','View dependents'),             ('dependent.manage','Manage dependents'),
  ('beneficiary.read','View beneficiaries'),        ('beneficiary.manage','Manage beneficiaries'),
  ('plan_year.read','View plan years'),             ('plan_year.manage','Manage plan years'),
  ('benefit_plan.read','View benefit plans'),       ('benefit_plan.manage','Manage benefit plans'),
  ('rate.read','View rates'),                       ('rate.manage','Manage rates'),
  ('contribution.read','View contribution rules'),  ('contribution.manage','Manage contribution rules'),
  ('enrollment.read','View enrollment events'),     ('enrollment.manage','Manage enrollment events'),
  ('election.read','View elections'),               ('election.manage','Manage elections'),
  ('election.submit','Submit elections'),
  ('life_event.read','View life events'),           ('life_event.manage','Manage life events'),
  ('payroll.read','View payroll deductions'),       ('payroll.manage','Manage payroll deductions'),
  ('payroll.export','Run payroll exports'),
  ('carrier_export.read','View carrier exports'),   ('carrier_export.manage','Manage carrier exports'),
  ('cobra.read','View COBRA'),                      ('cobra.manage','Manage COBRA'),
  ('aca.read','View ACA/ALE'),                      ('aca.manage','Manage ACA/ALE'),
  ('documents.read','View documents'),              ('documents.manage','Manage documents'),
  ('reports.read','View reports'),
  ('audit.read','View audit/history'),
  ('migration.manage','Manage migration/admin tools'),
  ('settings.read','View system settings'),         ('settings.manage','Manage system settings')
ON DUPLICATE KEY UPDATE label = VALUES(label);

-- ===========================================================================
-- 3. Role -> Permission mappings (INSERT IGNORE; PK prevents dups)
-- ===========================================================================

-- platform_admin: everything
INSERT IGNORE INTO role_permission (role_id, permission_id)
SELECT r.id, p.id FROM role r JOIN permission p ON r.key_name = 'platform_admin';

-- benefits_support_admin: read everything + operational manage (no org admin / settings / migration)
INSERT IGNORE INTO role_permission (role_id, permission_id)
SELECT r.id, p.id FROM role r JOIN permission p ON r.key_name = 'benefits_support_admin'
WHERE p.key_name LIKE '%.read'
   OR p.key_name IN ('employee.create','employee.update','dependent.manage','beneficiary.manage',
       'enrollment.manage','election.manage','life_event.manage','payroll.manage','payroll.export',
       'carrier_export.manage','cobra.manage','aca.manage','documents.manage');

-- agency_admin: manage brokers + employers in their agency, read the book, reports
INSERT IGNORE INTO role_permission (role_id, permission_id)
SELECT r.id, p.id FROM role r JOIN permission p ON r.key_name = 'agency_admin'
WHERE p.key_name IN ('agency.read','broker.read','broker.manage',
   'employer.read','employer.create','employer.update','employer.manage',
   'employer_contact.read','employer_contact.manage',
   'employee.read','dependent.read','beneficiary.read',
   'plan_year.read','benefit_plan.read','rate.read','contribution.read',
   'enrollment.read','election.read','life_event.read','payroll.read',
   'carrier_export.read','cobra.read','aca.read','documents.read','reports.read');

-- broker / producer: configure employer benefits + run enrollment for their book
INSERT IGNORE INTO role_permission (role_id, permission_id)
SELECT r.id, p.id FROM role r JOIN permission p ON r.key_name = 'broker'
WHERE p.key_name IN ('employer.read','employer_contact.manage',
   'employee.read','employee.create','employee.update','dependent.read','dependent.manage','beneficiary.read',
   'plan_year.manage','benefit_plan.manage','rate.manage','contribution.manage',
   'enrollment.manage','election.read','life_event.read',
   'payroll.read','carrier_export.manage','cobra.read','aca.read',
   'documents.manage','reports.read');

-- employer_admin / HR admin: full operations for their own company
INSERT IGNORE INTO role_permission (role_id, permission_id)
SELECT r.id, p.id FROM role r JOIN permission p ON r.key_name = 'employer_admin'
WHERE p.key_name IN ('employer.read','employer.update','employer_contact.manage',
   'employee.read','employee.create','employee.update','employee.delete',
   'dependent.read','dependent.manage','beneficiary.manage',
   'plan_year.read','benefit_plan.read','rate.read','contribution.read',
   'enrollment.read','enrollment.manage','election.read','election.manage',
   'life_event.read','life_event.manage',
   'payroll.read','payroll.manage','payroll.export',
   'carrier_export.read','carrier_export.manage','cobra.read','cobra.manage',
   'aca.read','aca.manage','documents.manage','reports.read','audit.read');

-- employer_read_only: read-only across employer-scoped modules
INSERT IGNORE INTO role_permission (role_id, permission_id)
SELECT r.id, p.id FROM role r JOIN permission p ON r.key_name = 'employer_read_only'
WHERE p.key_name IN ('employer.read','employer_contact.read','employee.read','dependent.read',
   'beneficiary.read','plan_year.read','benefit_plan.read','rate.read','contribution.read',
   'enrollment.read','election.read','life_event.read','payroll.read','carrier_export.read',
   'cobra.read','aca.read','documents.read','reports.read');

-- employer_payroll_admin: payroll-focused
INSERT IGNORE INTO role_permission (role_id, permission_id)
SELECT r.id, p.id FROM role r JOIN permission p ON r.key_name = 'employer_payroll_admin'
WHERE p.key_name IN ('employee.read','election.read','payroll.read','payroll.manage','payroll.export',
   'carrier_export.read','documents.read','reports.read');

-- cobra_admin: COBRA-focused
INSERT IGNORE INTO role_permission (role_id, permission_id)
SELECT r.id, p.id FROM role r JOIN permission p ON r.key_name = 'cobra_admin'
WHERE p.key_name IN ('employee.read','dependent.read','cobra.read','cobra.manage',
   'documents.manage','reports.read');

-- employee: self-service (row-level "own records" scope enforced in app layer).
-- NOTE: deliberately NO `employee.read` — that is the HR census/list permission.
-- An employee reads only their OWN profile via a self-scoped resolver, not the
-- employee list. Granting employee.read here would let an employee list everyone.
INSERT IGNORE INTO role_permission (role_id, permission_id)
SELECT r.id, p.id FROM role r JOIN permission p ON r.key_name = 'employee'
WHERE p.key_name IN ('dependent.read','dependent.manage','beneficiary.manage',
   'plan_year.read','benefit_plan.read','rate.read',
   'election.read','election.submit','life_event.read','life_event.manage','documents.read');

-- ===========================================================================
-- 4. Benefit types (global catalog). is_health = counts for COBRA/ACA grouping.
-- ===========================================================================
INSERT INTO benefit_type (key_name, label, is_health, display_order) VALUES
  ('medical',            'Medical',               1,  1),
  ('dental',             'Dental',                1,  2),
  ('vision',             'Vision',                1,  3),
  ('basic_life',         'Basic Life',            0,  4),
  ('voluntary_life',     'Voluntary Life',        0,  5),
  ('std',                'Short-Term Disability', 0,  6),
  ('ltd',                'Long-Term Disability',  0,  7),
  ('accident',           'Accident',              0,  8),
  ('critical_illness',   'Critical Illness',      0,  9),
  ('hospital_indemnity', 'Hospital Indemnity',    0, 10),
  ('hsa',                'HSA',                   0, 11),
  ('fsa',                'FSA',                   0, 12),
  ('dcfsa',              'Dependent Care FSA',    0, 13),
  ('commuter',           'Commuter',              0, 14),
  ('retirement',         '401(k) / Retirement',   0, 15),
  ('other',              'Other',                 0, 16)
ON DUPLICATE KEY UPDATE label = VALUES(label), is_health = VALUES(is_health), display_order = VALUES(display_order);

-- ===========================================================================
-- 5. PlanYear setup step definitions (checklist display/config; completion is
--    DERIVED from domain entities, not stored here).
-- ===========================================================================
INSERT INTO plan_year_setup_step_definition
  (step_key, label, description, display_order, category, required_by_default, applies_to, route) VALUES
  ('census_imported',        'Census imported / reviewed',     'Employee & dependent census loaded and reviewed.',           1,  'People',                1, 'census',        '/employees'),
  ('classes_configured',     'Employee classes configured',    'Employee/eligibility classes defined.',                      2,  'People',                1, 'eligibility',   '/eligibility'),
  ('eligibility_configured', 'Eligibility rules configured',   'Eligibility criteria & waiting periods set.',                3,  'People',                1, 'eligibility',   '/eligibility'),
  ('plans_configured',       'Benefit plans configured',       'At least one active plan with required fields per line.',    4,  'Plan Setup',            1, 'benefit_plans', '/benefit-plans'),
  ('options_configured',     'Plan options configured',        'Plan options / riders / tiers configured.',                  5,  'Plan Setup',            0, 'benefit_plans', '/benefit-plans'),
  ('rates_configured',       'Rates configured',               'Valid rates loaded for all plans requiring them.',           6,  'Rates & Contributions', 1, 'rates',         '/benefit-plans'),
  ('contributions_configured','Employer contributions configured','Employer contribution rules set per class.',              7,  'Rates & Contributions', 1, 'contributions', '/eligibility/contributions/new'),
  ('window_configured',      'Enrollment window configured',   'Enrollment event with start/end dates.',                     8,  'Enrollment',            1, 'enrollment',    '/enrollment-events'),
  ('communications_configured','Employee communications configured','Notices / email templates / messages prepared.',         9,  'Communications',        1, 'communications','/documents'),
  ('documents_configured',   'Documents / forms configured',   'Required documents and forms uploaded.',                    10,  'Communications',        1, 'documents',     '/documents'),
  ('invitations_sent',       'Enrollment invitations sent',    'Eligible employees invited to enroll.',                     11,  'Enrollment',            1, 'enrollment',    '/enrollment-progress'),
  ('elections_reviewed',     'Employee elections reviewed',    'Submitted elections reviewed.',                             12,  'Enrollment',            1, 'enrollment',    '/enrollment-progress'),
  ('waivers_reviewed',       'Waivers reviewed',               'Coverage waivers reviewed.',                                13,  'Enrollment',            0, 'enrollment',    '/enrollment-progress'),
  ('payroll_reviewed',       'Payroll deductions reviewed',    'Deduction amounts reviewed before export.',                 14,  'Payroll',               1, 'payroll',       '/payroll-deductions'),
  ('carrier_exports_configured','Carrier exports configured',  'Carrier export profiles / field mappings set.',             15,  'Carrier',               1, 'carrier_export','/carrier-exports/mapping'),
  ('carrier_exports_generated','Carrier exports generated',    'Required carrier export files generated/sent/approved.',    16,  'Carrier',               1, 'carrier_export','/carrier-exports'),
  ('readiness_review',       'Final audit / readiness review', 'Final go-live readiness check.',                            17,  'Readiness',             1, 'readiness',     '/plan-years')
ON DUPLICATE KEY UPDATE
  label = VALUES(label), description = VALUES(description), display_order = VALUES(display_order),
  category = VALUES(category), required_by_default = VALUES(required_by_default),
  applies_to = VALUES(applies_to), route = VALUES(route);

-- ===========================================================================
-- 6. Migration registry defaults: none required. migration_batch.status is an
--    enum with default 'pending'; no seed rows needed.
-- ===========================================================================
