-- GoBenefits V4 — Per-customer DB schema v1 (full)
-- Applied IDENTICALLY to every employer database. The DB IS the tenant boundary
-- (no tenant_id columns). Engine: Aurora MySQL 8.0. InnoDB, utf8mb4, real FKs.
-- Every domain row carries legacy_source/legacy_id for traceability.
SET NAMES utf8mb4;

-- ===========================================================================
-- Employer setup
-- ===========================================================================

CREATE TABLE employer_profile (
  id            BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  legal_name    VARCHAR(255) NOT NULL,
  ein           VARCHAR(20)  NULL,
  rate_format   TINYINT      NULL,             -- legacy RateFormat (age-calc input)
  association_name VARCHAR(255) NULL,
  legacy_source INT          NULL,
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE employer_location (
  id            BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  business_name VARCHAR(255) NULL,
  fein          VARCHAR(20)  NULL,
  address1      VARCHAR(255) NULL,
  city          VARCHAR(128) NULL,
  state         CHAR(2)      NULL,
  zip           VARCHAR(10)  NULL,
  legacy_id     INT          NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE employer_division (
  id            BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  name          VARCHAR(128) NOT NULL,
  location_id   BINARY(16)   NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_division_location FOREIGN KEY (location_id) REFERENCES employer_location (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE employer_payroll_settings (
  id              BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  default_frequency ENUM('12','24','26','52') NULL,
  sync_quickbooks TINYINT(1)   NOT NULL DEFAULT 0,
  qb_realm_id     VARCHAR(64)  NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Eligibility CLASS (who is eligible; criteria) — distinct from contribution
CREATE TABLE eligibility_class (
  id                BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  name              VARCHAR(128) NOT NULL,
  class_code        VARCHAR(64)  NULL,
  min_hours_weekly  DECIMAL(6,2) NULL,
  waiting_period_days INT        NULL,
  legacy_id         INT          NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_elig_class_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE employer_eligibility_rules (
  id                BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  eligibility_class_id BINARY(16) NULL,
  rule_json         JSON         NULL,         -- structured criteria
  effective_date    DATE         NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_elig_rules_class FOREIGN KEY (eligibility_class_id) REFERENCES eligibility_class (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Employer contribution RULE (how much employer pays) — explicit percentages
CREATE TABLE contribution_rule (
  id                  BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  name                VARCHAR(128) NOT NULL,
  display_name        VARCHAR(128) NULL,
  pct_employee_health  DECIMAL(5,2) NOT NULL DEFAULT 0,
  pct_employee_dental  DECIMAL(5,2) NOT NULL DEFAULT 0,
  pct_employee_vision  DECIMAL(5,2) NOT NULL DEFAULT 0,
  pct_dependent_health DECIMAL(5,2) NOT NULL DEFAULT 0,
  pct_dependent_dental DECIMAL(5,2) NOT NULL DEFAULT 0,
  pct_dependent_vision DECIMAL(5,2) NOT NULL DEFAULT 0,
  fixed_basic_life     DECIMAL(10,2) NULL,
  legacy_id            INT         NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_contrib_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===========================================================================
-- People (Employee decomposed — no god table)
-- ===========================================================================

CREATE TABLE employee (
  id            BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  -- Employer-assigned census number. NOT an external/integration id (those live
  -- in employee_integration_ref). Unique within this employer DB when present;
  -- multiple NULLs allowed (legacy/import flexibility). utf8mb4_0900_ai_ci
  -- collation makes the unique check case-insensitive.
  employee_number VARCHAR(64) NULL,
  first_name    VARCHAR(128) NOT NULL,
  middle_name   VARCHAR(128) NULL,
  last_name     VARCHAR(128) NOT NULL,
  date_of_birth DATE         NULL,
  gender        VARCHAR(16)  NULL,
  ssn_enc       VARBINARY(256) NULL,           -- encrypted (KMS/app layer)
  tobacco_user  TINYINT(1)   NULL,
  legacy_source INT          NULL,
  legacy_id     INT          NULL,
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_employee_number (employee_number),
  KEY ix_employee_legacy (legacy_source, legacy_id),
  KEY ix_employee_name (last_name, first_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE employee_employment (
  employee_id       BINARY(16)   NOT NULL,
  location_id       BINARY(16)   NULL,
  division_id       BINARY(16)   NULL,
  eligibility_class_id BINARY(16) NULL,
  contribution_rule_id BINARY(16) NULL,
  hire_date         DATE         NULL,
  original_hire_date DATE        NULL,
  termination_date  DATE         NULL,
  termination_reason VARCHAR(255) NULL,
  status            ENUM('active','terminated','cobra','retired','leave') NOT NULL DEFAULT 'active',
  employee_class    VARCHAR(64)  NULL,
  job_title         VARCHAR(128) NULL,
  hours_weekly      DECIMAL(6,2) NULL,
  salary            DECIMAL(12,2) NULL,
  pay_type          ENUM('salary','hourly') NULL,
  PRIMARY KEY (employee_id),
  KEY ix_employment_elig (eligibility_class_id),
  KEY ix_employment_contrib (contribution_rule_id),
  CONSTRAINT fk_employment_employee FOREIGN KEY (employee_id) REFERENCES employee (id) ON DELETE CASCADE,
  CONSTRAINT fk_employment_location FOREIGN KEY (location_id) REFERENCES employer_location (id),
  CONSTRAINT fk_employment_division FOREIGN KEY (division_id) REFERENCES employer_division (id),
  CONSTRAINT fk_employment_elig     FOREIGN KEY (eligibility_class_id) REFERENCES eligibility_class (id),
  CONSTRAINT fk_employment_contrib  FOREIGN KEY (contribution_rule_id) REFERENCES contribution_rule (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE employee_address (
  id            BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  employee_id   BINARY(16)   NOT NULL,
  address1      VARCHAR(255) NULL,
  address2      VARCHAR(255) NULL,
  city          VARCHAR(128) NULL,
  state         CHAR(2)      NULL,
  zip           VARCHAR(10)  NULL,
  is_current    TINYINT(1)   NOT NULL DEFAULT 1,   -- address history supported
  effective_date DATE        NULL,
  PRIMARY KEY (id),
  KEY ix_address_employee (employee_id),
  CONSTRAINT fk_address_employee FOREIGN KEY (employee_id) REFERENCES employee (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE employee_contact (
  employee_id   BINARY(16)   NOT NULL,
  email         VARCHAR(320) NULL,
  alt_email     VARCHAR(320) NULL,
  home_phone    VARCHAR(32)  NULL,
  cell_phone    VARCHAR(32)  NULL,
  emergency_contact VARCHAR(255) NULL,
  PRIMARY KEY (employee_id),
  CONSTRAINT fk_contact_employee FOREIGN KEY (employee_id) REFERENCES employee (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE employee_eligibility (
  employee_id   BINARY(16)   NOT NULL,
  eligibility_class_id BINARY(16) NULL,
  eligible      TINYINT(1)   NOT NULL DEFAULT 0,
  eligible_date DATE         NULL,
  reason        VARCHAR(255) NULL,
  PRIMARY KEY (employee_id),
  CONSTRAINT fk_emp_elig_employee FOREIGN KEY (employee_id) REFERENCES employee (id) ON DELETE CASCADE,
  CONSTRAINT fk_emp_elig_class    FOREIGN KEY (eligibility_class_id) REFERENCES eligibility_class (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE employee_payroll (
  employee_id   BINARY(16)   NOT NULL,
  pay_frequency ENUM('12','24','26','52') NULL,
  pay_rate      DECIMAL(12,2) NULL,
  paygrade      VARCHAR(64)  NULL,
  pay_cycle_code VARCHAR(32) NULL,
  PRIMARY KEY (employee_id),
  CONSTRAINT fk_payroll_employee FOREIGN KEY (employee_id) REFERENCES employee (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE employee_aca (
  employee_id       BINARY(16)   NOT NULL,
  measurement_start DATE         NULL,
  measurement_end   DATE         NULL,
  stability_start   DATE         NULL,
  stability_end     DATE         NULL,
  lookback_hours    DECIMAL(8,2) NULL,
  safe_harbor_amount DECIMAL(12,2) NULL,
  aca_eligible      TINYINT(1)   NULL,
  PRIMARY KEY (employee_id),
  CONSTRAINT fk_aca_employee FOREIGN KEY (employee_id) REFERENCES employee (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE employee_integration_ref (
  employee_id       BINARY(16)   NOT NULL,
  adp_worker_id     VARCHAR(64)  NULL,
  adp_associate_oid VARCHAR(64)  NULL,
  bamboo_employee_id INT         NULL,
  qb_list_id        VARCHAR(64)  NULL,
  ext_employee_id   VARCHAR(64)  NULL,
  PRIMARY KEY (employee_id),
  CONSTRAINT fk_intref_employee FOREIGN KEY (employee_id) REFERENCES employee (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE dependent (
  id            BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  employee_id   BINARY(16)   NOT NULL,
  first_name    VARCHAR(128) NOT NULL,
  last_name     VARCHAR(128) NOT NULL,
  date_of_birth DATE         NULL,
  gender        VARCHAR(16)  NULL,
  relationship  ENUM('spouse','child','domestic_partner','other') NOT NULL,
  ssn_enc       VARBINARY(256) NULL,
  disabled      TINYINT(1)   NULL,
  student       TINYINT(1)   NULL,
  legacy_id     INT          NULL,
  PRIMARY KEY (id),
  KEY ix_dependent_employee (employee_id),
  CONSTRAINT fk_dependent_employee FOREIGN KEY (employee_id) REFERENCES employee (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE beneficiary (
  id            BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  employee_id   BINARY(16)   NOT NULL,
  name          VARCHAR(255) NOT NULL,
  relationship  VARCHAR(64)  NULL,
  type          ENUM('primary','contingent') NOT NULL DEFAULT 'primary',
  allocation_pct DECIMAL(5,2) NOT NULL DEFAULT 0,   -- per type, must sum to 100
  ssn_enc       VARBINARY(256) NULL,
  PRIMARY KEY (id),
  KEY ix_beneficiary_employee (employee_id),
  CONSTRAINT fk_beneficiary_employee FOREIGN KEY (employee_id) REFERENCES employee (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===========================================================================
-- Benefits setup
-- ===========================================================================

CREATE TABLE plan_year (
  id            BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  label         VARCHAR(64)  NOT NULL,
  year          SMALLINT     NOT NULL,
  period_start  DATE         NOT NULL,
  period_end    DATE         NOT NULL,
  status        ENUM('setup','active','archived') NOT NULL DEFAULT 'setup',
  PRIMARY KEY (id),
  UNIQUE KEY uq_plan_year (year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE benefit_plan (
  id            BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  plan_year_id  BINARY(16)   NOT NULL,
  benefit_type_key VARCHAR(64) NOT NULL,       -- references control-plane benefit_type
  carrier_name  VARCHAR(255) NULL,
  plan_name     VARCHAR(255) NOT NULL,
  plan_code     VARCHAR(64)  NULL,
  subtype       VARCHAR(64)  NULL,             -- PPO/HDHP/EPO/DHMO
  network       VARCHAR(128) NULL,
  hsa_eligible  TINYINT(1)   NULL,
  setup_status  ENUM('not_started','in_progress','complete','needs_attention') NOT NULL DEFAULT 'not_started',
  setup_issue_count INT      NOT NULL DEFAULT 0,
  -- comparison attrs (typed where common, JSON for the long carrier tail)
  deductible_single DECIMAL(10,2) NULL,
  deductible_family DECIMAL(10,2) NULL,
  oop_single        DECIMAL(10,2) NULL,
  oop_family        DECIMAL(10,2) NULL,
  pcp_copay         VARCHAR(64)  NULL,
  specialist_copay  VARCHAR(64)  NULL,
  attributes_json   JSON         NULL,
  status        ENUM('draft','active','inactive') NOT NULL DEFAULT 'draft',
  legacy_id     INT          NULL,
  PRIMARY KEY (id),
  KEY ix_plan_year (plan_year_id),
  CONSTRAINT fk_plan_year FOREIGN KEY (plan_year_id) REFERENCES plan_year (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE plan_option (
  id            BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  benefit_plan_id BINARY(16) NOT NULL,
  name          VARCHAR(128) NULL,             -- e.g. coverage option / rider / band
  eligibility_class_id BINARY(16) NULL,        -- availability by class
  PRIMARY KEY (id),
  KEY ix_option_plan (benefit_plan_id),
  CONSTRAINT fk_option_plan FOREIGN KEY (benefit_plan_id) REFERENCES benefit_plan (id) ON DELETE CASCADE,
  CONSTRAINT fk_option_class FOREIGN KEY (eligibility_class_id) REFERENCES eligibility_class (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE plan_rate (
  id            BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  benefit_plan_id BINARY(16) NOT NULL,
  plan_option_id BINARY(16)  NULL,
  age           SMALLINT     NULL,             -- null = non-age-banded
  rate_ee       DECIMAL(10,2) NOT NULL,        -- employee only
  rate_ee_spouse DECIMAL(10,2) NULL,           -- ES
  rate_ee_child DECIMAL(10,2) NULL,            -- EC
  rate_family   DECIMAL(10,2) NULL,            -- EF
  effective_date DATE        NOT NULL,
  PRIMARY KEY (id),
  KEY ix_rate_plan (benefit_plan_id, age, effective_date),
  CONSTRAINT fk_rate_plan   FOREIGN KEY (benefit_plan_id) REFERENCES benefit_plan (id) ON DELETE CASCADE,
  CONSTRAINT fk_rate_option FOREIGN KEY (plan_option_id)  REFERENCES plan_option (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===========================================================================
-- Enrollment: events, invitations, elections, coverage, waivers
-- ===========================================================================

CREATE TABLE enrollment_event (
  id            BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  plan_year_id  BINARY(16)   NOT NULL,
  type          ENUM('open_enrollment','new_hire','life_event') NOT NULL,
  name          VARCHAR(128) NULL,
  effective_date DATE        NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_event_plan_year FOREIGN KEY (plan_year_id) REFERENCES plan_year (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE enrollment_window (
  id            BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  enrollment_event_id BINARY(16) NOT NULL,
  window_start  DATE         NOT NULL,
  window_end    DATE         NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_window_event FOREIGN KEY (enrollment_event_id) REFERENCES enrollment_event (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE enrollment_invitation (
  id            BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  employee_id   BINARY(16)   NOT NULL,
  enrollment_event_id BINARY(16) NOT NULL,
  sent_at       DATETIME(3)  NULL,
  status        ENUM('not_sent','sent','opened','completed') NOT NULL DEFAULT 'not_sent',
  reminders_sent INT         NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_invite (employee_id, enrollment_event_id),
  CONSTRAINT fk_invite_employee FOREIGN KEY (employee_id) REFERENCES employee (id) ON DELETE CASCADE,
  CONSTRAINT fk_invite_event    FOREIGN KEY (enrollment_event_id) REFERENCES enrollment_event (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- What the employee CHOSE (intent)
CREATE TABLE employee_election (
  id            BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  employee_id   BINARY(16)   NOT NULL,
  benefit_plan_id BINARY(16) NOT NULL,
  plan_option_id BINARY(16)  NULL,
  enrollment_event_id BINARY(16) NULL,
  coverage_tier ENUM('ee','ee_spouse','ee_child','family','waived') NOT NULL,
  status        ENUM('not_started','in_progress','submitted','approved','waived','terminated') NOT NULL DEFAULT 'not_started',
  premium_total DECIMAL(10,2) NULL,
  employer_contribution DECIMAL(10,2) NULL,
  employee_cost DECIMAL(10,2) NULL,
  effective_date DATE        NULL,
  submitted_at  DATETIME(3)  NULL,
  legacy_id     INT          NULL,
  PRIMARY KEY (id),
  KEY ix_election_employee (employee_id),
  KEY ix_election_plan (benefit_plan_id),
  CONSTRAINT fk_election_employee FOREIGN KEY (employee_id) REFERENCES employee (id),
  CONSTRAINT fk_election_plan     FOREIGN KEY (benefit_plan_id) REFERENCES benefit_plan (id),
  CONSTRAINT fk_election_option   FOREIGN KEY (plan_option_id) REFERENCES plan_option (id),
  CONSTRAINT fk_election_event    FOREIGN KEY (enrollment_event_id) REFERENCES enrollment_event (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE election_hsa (
  election_id   BINARY(16)   NOT NULL,
  annual_amount DECIMAL(10,2) NULL,
  frequency     VARCHAR(32)  NULL,
  waived        TINYINT(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (election_id),
  CONSTRAINT fk_hsa_election FOREIGN KEY (election_id) REFERENCES employee_election (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE dependent_election (
  election_id   BINARY(16)   NOT NULL,
  dependent_id  BINARY(16)   NOT NULL,
  PRIMARY KEY (election_id, dependent_id),
  CONSTRAINT fk_de_election  FOREIGN KEY (election_id)  REFERENCES employee_election (id) ON DELETE CASCADE,
  CONSTRAINT fk_de_dependent FOREIGN KEY (dependent_id) REFERENCES dependent (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- What coverage is ACTIVE (effective state, separate from intent)
CREATE TABLE coverage_record (
  id            BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  employee_id   BINARY(16)   NOT NULL,
  benefit_plan_id BINARY(16) NOT NULL,
  election_id   BINARY(16)   NULL,
  coverage_tier ENUM('ee','ee_spouse','ee_child','family') NOT NULL,
  start_date    DATE         NOT NULL,
  end_date      DATE         NULL,             -- null = open/active
  source        ENUM('open_enrollment','new_hire','life_event','cobra','migration') NULL,
  legacy_id     INT          NULL,
  PRIMARY KEY (id),
  KEY ix_coverage_employee (employee_id),
  KEY ix_coverage_active (employee_id, start_date, end_date),
  CONSTRAINT fk_coverage_employee FOREIGN KEY (employee_id) REFERENCES employee (id),
  CONSTRAINT fk_coverage_plan     FOREIGN KEY (benefit_plan_id) REFERENCES benefit_plan (id),
  CONSTRAINT fk_coverage_election FOREIGN KEY (election_id) REFERENCES employee_election (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE coverage_dependent (
  coverage_record_id BINARY(16) NOT NULL,
  dependent_id       BINARY(16) NOT NULL,
  PRIMARY KEY (coverage_record_id, dependent_id),
  CONSTRAINT fk_cd_coverage  FOREIGN KEY (coverage_record_id) REFERENCES coverage_record (id) ON DELETE CASCADE,
  CONSTRAINT fk_cd_dependent FOREIGN KEY (dependent_id) REFERENCES dependent (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE waiver (
  id            BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  employee_id   BINARY(16)   NOT NULL,
  benefit_type_key VARCHAR(64) NOT NULL,
  enrollment_event_id BINARY(16) NULL,
  reason        VARCHAR(255) NULL,
  other_coverage VARCHAR(255) NULL,
  waived_at     DATETIME(3)  NULL,
  PRIMARY KEY (id),
  KEY ix_waiver_employee (employee_id),
  CONSTRAINT fk_waiver_employee FOREIGN KEY (employee_id) REFERENCES employee (id) ON DELETE CASCADE,
  CONSTRAINT fk_waiver_event    FOREIGN KEY (enrollment_event_id) REFERENCES enrollment_event (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===========================================================================
-- Life events
-- ===========================================================================

CREATE TABLE life_event_type (
  id            BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  key_name      VARCHAR(64)  NOT NULL,
  label         VARCHAR(128) NOT NULL,
  description   VARCHAR(512) NULL,
  documentation_required TINYINT(1) NOT NULL DEFAULT 1,
  review_required        TINYINT(1) NOT NULL DEFAULT 1,
  effective_date_rule    VARCHAR(64) NULL,     -- event_date | first_of_following_month | day_after_loss
  PRIMARY KEY (id),
  UNIQUE KEY uq_let_key (key_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE life_event (
  id            BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  employee_id   BINARY(16)   NOT NULL,
  life_event_type_id BINARY(16) NOT NULL,
  event_date    DATE         NULL,
  submitted_date DATE        NULL,
  status        ENUM('draft','submitted','under_review','needs_documents','approved','rejected','election_window_open','completed','payroll_carrier_pending') NOT NULL DEFAULT 'draft',
  documents_status VARCHAR(64) NULL,
  election_window VARCHAR(64) NULL,
  impact        VARCHAR(512) NULL,
  payroll_impact VARCHAR(255) NULL,
  PRIMARY KEY (id),
  KEY ix_life_event_employee (employee_id),
  CONSTRAINT fk_le_employee FOREIGN KEY (employee_id) REFERENCES employee (id) ON DELETE CASCADE,
  CONSTRAINT fk_le_type     FOREIGN KEY (life_event_type_id) REFERENCES life_event_type (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE life_event_document (
  id            BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  life_event_id BINARY(16)   NOT NULL,
  document_id   BINARY(16)   NULL,
  required      TINYINT(1)   NOT NULL DEFAULT 1,
  status        ENUM('missing','uploaded','verified','not_required') NOT NULL DEFAULT 'missing',
  PRIMARY KEY (id),
  CONSTRAINT fk_led_event FOREIGN KEY (life_event_id) REFERENCES life_event (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE life_event_approval (
  id            BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  life_event_id BINARY(16)   NOT NULL,
  decision      ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  decided_by    BINARY(16)   NULL,
  decided_at    DATETIME(3)  NULL,
  notes         VARCHAR(512) NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_lea_event FOREIGN KEY (life_event_id) REFERENCES life_event (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===========================================================================
-- Payroll: deductions, codes, schedules, exports
-- ===========================================================================

CREATE TABLE deduction_code (
  id            BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  benefit_type_key VARCHAR(64) NULL,
  benefit_plan_id BINARY(16)  NULL,
  payroll_code  VARCHAR(64)  NOT NULL,
  pre_post_tax  ENUM('pre','post') NOT NULL DEFAULT 'pre',
  PRIMARY KEY (id),
  CONSTRAINT fk_dcode_plan FOREIGN KEY (benefit_plan_id) REFERENCES benefit_plan (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE deduction_schedule (
  id            BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  frequency     ENUM('12','24','26','52') NOT NULL,
  pay_cycle     VARCHAR(16)  NULL,
  period_start  DATE         NULL,
  period_end    DATE         NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE payroll_deduction (
  id            BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  employee_id   BINARY(16)   NOT NULL,
  election_id   BINARY(16)   NULL,
  deduction_code_id BINARY(16) NULL,
  deduction_schedule_id BINARY(16) NULL,
  pre_post_tax  ENUM('pre','post') NULL,
  cost_ee       DECIMAL(10,2) NOT NULL,
  cost_er       DECIMAL(10,2) NOT NULL,
  cost_total    DECIMAL(10,2) NOT NULL,
  effective_date DATE        NULL,
  end_date      DATE         NULL,
  processed     TINYINT(1)   NOT NULL DEFAULT 0,
  source        VARCHAR(32)  NULL,
  legacy_id     INT          NULL,
  PRIMARY KEY (id),
  KEY ix_deduction_employee (employee_id),
  CONSTRAINT fk_deduction_employee FOREIGN KEY (employee_id) REFERENCES employee (id),
  CONSTRAINT fk_deduction_election FOREIGN KEY (election_id) REFERENCES employee_election (id),
  CONSTRAINT fk_deduction_code     FOREIGN KEY (deduction_code_id) REFERENCES deduction_code (id),
  CONSTRAINT fk_deduction_sched    FOREIGN KEY (deduction_schedule_id) REFERENCES deduction_schedule (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE payroll_export_batch (
  id            BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  plan_year_id  BINARY(16)   NULL,
  status        ENUM('draft','generated','sent','approved','failed') NOT NULL DEFAULT 'draft',
  generated_at  DATETIME(3)  NULL,
  destination   VARCHAR(64)  NULL,             -- ADP, QuickBooks, file
  line_count    INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  CONSTRAINT fk_pexport_year FOREIGN KEY (plan_year_id) REFERENCES plan_year (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE payroll_export_line (
  id            BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  payroll_export_batch_id BINARY(16) NOT NULL,
  employee_id   BINARY(16)   NOT NULL,
  payroll_deduction_id BINARY(16) NULL,
  change_type   ENUM('add','change','term','none') NOT NULL DEFAULT 'none',  -- "what changed since last export"
  amount        DECIMAL(10,2) NULL,
  status        ENUM('ok','error') NOT NULL DEFAULT 'ok',
  error         VARCHAR(512) NULL,
  PRIMARY KEY (id),
  KEY ix_pexline_batch (payroll_export_batch_id),
  CONSTRAINT fk_pexline_batch FOREIGN KEY (payroll_export_batch_id) REFERENCES payroll_export_batch (id) ON DELETE CASCADE,
  CONSTRAINT fk_pexline_employee FOREIGN KEY (employee_id) REFERENCES employee (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===========================================================================
-- Carrier exports (EDI / file feeds)
-- ===========================================================================

CREATE TABLE carrier_export_profile (
  id            BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  carrier_name  VARCHAR(255) NOT NULL,
  benefit_type_key VARCHAR(64) NULL,
  format        VARCHAR(64)  NULL,             -- EDI 834, CSV, carrier-specific
  field_mapping_json JSON    NULL,             -- carrier field <-> internal field
  active        TINYINT(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE carrier_export_batch (
  id            BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  carrier_export_profile_id BINARY(16) NOT NULL,
  plan_year_id  BINARY(16)   NULL,
  status        ENUM('draft','generated','validated','sent','approved','failed') NOT NULL DEFAULT 'draft',
  generated_at  DATETIME(3)  NULL,
  sent_at       DATETIME(3)  NULL,
  s3_key        VARCHAR(1024) NULL,            -- generated file
  line_count    INT          NOT NULL DEFAULT 0,
  error_count   INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY ix_cexbatch_profile (carrier_export_profile_id),
  CONSTRAINT fk_cexbatch_profile FOREIGN KEY (carrier_export_profile_id) REFERENCES carrier_export_profile (id),
  CONSTRAINT fk_cexbatch_year    FOREIGN KEY (plan_year_id) REFERENCES plan_year (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE carrier_export_line (
  id            BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  carrier_export_batch_id BINARY(16) NOT NULL,
  employee_id   BINARY(16)   NOT NULL,
  action        ENUM('add','change','term') NOT NULL,
  validation_status ENUM('ok','error') NOT NULL DEFAULT 'ok',
  error         VARCHAR(512) NULL,             -- e.g. "SSN mismatch"
  PRIMARY KEY (id),
  KEY ix_cexline_batch (carrier_export_batch_id),
  CONSTRAINT fk_cexline_batch FOREIGN KEY (carrier_export_batch_id) REFERENCES carrier_export_batch (id) ON DELETE CASCADE,
  CONSTRAINT fk_cexline_employee FOREIGN KEY (employee_id) REFERENCES employee (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===========================================================================
-- ACA / ALE
-- ===========================================================================

CREATE TABLE measurement_period (
  id            BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  employee_id   BINARY(16)   NOT NULL,
  type          ENUM('initial','standard') NOT NULL,
  start_date    DATE         NOT NULL,
  end_date      DATE         NOT NULL,
  total_hours   DECIMAL(8,2) NULL,
  avg_hours_weekly DECIMAL(6,2) NULL,
  PRIMARY KEY (id),
  KEY ix_mp_employee (employee_id),
  CONSTRAINT fk_mp_employee FOREIGN KEY (employee_id) REFERENCES employee (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE stability_period (
  id            BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  employee_id   BINARY(16)   NOT NULL,
  start_date    DATE         NOT NULL,
  end_date      DATE         NOT NULL,
  eligible      TINYINT(1)   NULL,
  PRIMARY KEY (id),
  KEY ix_sp_employee (employee_id),
  CONSTRAINT fk_sp_employee FOREIGN KEY (employee_id) REFERENCES employee (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE aca_eligibility_status (
  employee_id   BINARY(16)   NOT NULL,
  plan_year     SMALLINT     NOT NULL,
  status        VARCHAR(64)  NOT NULL,         -- full_time, part_time, variable, seasonal
  determined_at DATETIME(3)  NULL,
  PRIMARY KEY (employee_id, plan_year),
  CONSTRAINT fk_acastatus_employee FOREIGN KEY (employee_id) REFERENCES employee (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE ale_monthly_snapshot (
  id            BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  year          SMALLINT     NOT NULL,
  month         TINYINT      NOT NULL,
  full_time_count INT        NOT NULL DEFAULT 0,
  fte_count     DECIMAL(8,2) NOT NULL DEFAULT 0,
  pt_hours      DECIMAL(10,2) NULL,
  seasonal_count INT         NOT NULL DEFAULT 0,
  total_count   INT          NOT NULL DEFAULT 0,
  is_ale        TINYINT(1)   NULL,
  source        VARCHAR(64)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ale_month (year, month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE form_1095_record (
  id            BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  employee_id   BINARY(16)   NOT NULL,
  tax_year      SMALLINT     NOT NULL,
  data_json     JSON         NULL,             -- 1095-C lines/codes (was 98-col form1095)
  filing_status ENUM('draft','generated','filed','corrected') NOT NULL DEFAULT 'draft',
  PRIMARY KEY (id),
  UNIQUE KEY uq_1095 (employee_id, tax_year),
  CONSTRAINT fk_1095_employee FOREIGN KEY (employee_id) REFERENCES employee (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===========================================================================
-- COBRA (NET-NEW module — legacy had only employee flags)
-- ===========================================================================

CREATE TABLE cobra_event (
  id            BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  employee_id   BINARY(16)   NOT NULL,
  event_type    ENUM('termination','reduction_in_hours','divorce','dependent_aging_out','death','other') NOT NULL,
  event_date    DATE         NOT NULL,
  coverage      VARCHAR(255) NULL,             -- lines affected
  notice_deadline DATE       NULL,
  election_window_start DATE NULL,
  election_window_end   DATE NULL,
  cobra_status  ENUM('pending_review','notice_due','notice_overdue','notice_sent','election_window_open','elected','waived','election_expired','complete') NOT NULL DEFAULT 'pending_review',
  payment_status VARCHAR(32) NULL,
  tpa           VARCHAR(128) NULL,
  legacy_id     INT          NULL,
  PRIMARY KEY (id),
  KEY ix_cobra_employee (employee_id),
  CONSTRAINT fk_cobra_employee FOREIGN KEY (employee_id) REFERENCES employee (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE cobra_qualified_beneficiary (
  id            BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  cobra_event_id BINARY(16)  NOT NULL,
  person_name   VARCHAR(255) NOT NULL,
  relationship  ENUM('employee','spouse','child','other') NOT NULL,
  dependent_id  BINARY(16)   NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_qb_event     FOREIGN KEY (cobra_event_id) REFERENCES cobra_event (id) ON DELETE CASCADE,
  CONSTRAINT fk_qb_dependent FOREIGN KEY (dependent_id) REFERENCES dependent (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE cobra_election (
  id            BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  cobra_event_id BINARY(16)  NOT NULL,
  elected       TINYINT(1)   NOT NULL DEFAULT 0,
  elected_date  DATE         NULL,
  coverage      VARCHAR(255) NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_cobraelect_event FOREIGN KEY (cobra_event_id) REFERENCES cobra_event (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE cobra_payment (
  id            BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  cobra_event_id BINARY(16)  NOT NULL,
  period        VARCHAR(32)  NULL,
  amount        DECIMAL(10,2) NULL,
  due_date      DATE         NULL,
  status        ENUM('due','paid','late','missed') NOT NULL DEFAULT 'due',
  PRIMARY KEY (id),
  CONSTRAINT fk_cobrapay_event FOREIGN KEY (cobra_event_id) REFERENCES cobra_event (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE cobra_notice (
  id            BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  cobra_event_id BINARY(16)  NOT NULL,
  type          VARCHAR(64)  NULL,
  status        ENUM('draft','due','sent','overdue') NOT NULL DEFAULT 'draft',
  sent_at       DATETIME(3)  NULL,
  deadline      DATE         NULL,
  document_id   BINARY(16)   NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_cobranotice_event FOREIGN KEY (cobra_event_id) REFERENCES cobra_event (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===========================================================================
-- Documents (files in S3; row = index) + e-signature
-- ===========================================================================

CREATE TABLE document (
  id            BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  category      VARCHAR(64)  NULL,
  file_name     VARCHAR(255) NOT NULL,
  s3_key        VARCHAR(1024) NOT NULL,
  version       INT          NOT NULL DEFAULT 1,
  legacy_path   VARCHAR(1024) NULL,
  uploaded_by   BINARY(16)   NULL,
  uploaded_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- polymorphic links: a document can relate to many entities
CREATE TABLE document_link (
  document_id   BINARY(16)   NOT NULL,
  entity_type   VARCHAR(64)  NOT NULL,         -- employee, dependent, plan_year, election, cobra_event, ...
  entity_id     BINARY(16)   NOT NULL,
  PRIMARY KEY (document_id, entity_type, entity_id),
  CONSTRAINT fk_doclink_document FOREIGN KEY (document_id) REFERENCES document (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE signature_request (
  id            BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  document_id   BINARY(16)   NULL,
  employee_id   BINARY(16)   NULL,
  provider      VARCHAR(64)  NULL,             -- AdobeSign/EchoSign/internal
  status        ENUM('pending','sent','signed','declined','expired') NOT NULL DEFAULT 'pending',
  requested_at  DATETIME(3)  NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_sigreq_document FOREIGN KEY (document_id) REFERENCES document (id),
  CONSTRAINT fk_sigreq_employee FOREIGN KEY (employee_id) REFERENCES employee (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE signed_form (
  id            BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  signature_request_id BINARY(16) NULL,
  document_id   BINARY(16)   NULL,
  signed_at     DATETIME(3)  NULL,
  sign_ip       VARCHAR(64)  NULL,
  sign_user_agent VARCHAR(512) NULL,
  signature_s3_key VARCHAR(1024) NULL,
  legacy_id     INT          NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_signed_request  FOREIGN KEY (signature_request_id) REFERENCES signature_request (id),
  CONSTRAINT fk_signed_document FOREIGN KEY (document_id) REFERENCES document (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===========================================================================
-- Plan-year setup checklist override (admin only; NOT completion truth)
-- ===========================================================================

CREATE TABLE plan_year_setup_step_override (
  id              BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  plan_year_id    BINARY(16)   NOT NULL,
  step_key        VARCHAR(64)  NOT NULL,       -- references control-plane step definition
  override_status ENUM('not_applicable','acknowledged','unblocked') NULL,
  is_hidden       TINYINT(1)   NOT NULL DEFAULT 0,
  is_required_override TINYINT(1) NULL,
  owner           BINARY(16)   NULL,
  target_date     DATE         NULL,
  notes           VARCHAR(512) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_step_override (plan_year_id, step_key),
  CONSTRAINT fk_step_override_year FOREIGN KEY (plan_year_id) REFERENCES plan_year (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===========================================================================
-- Audit / history (field-level; preserves legacy audittrail granularity)
-- ===========================================================================

CREATE TABLE audit_event (
  id            BIGINT       NOT NULL AUTO_INCREMENT,
  table_name    VARCHAR(64)  NOT NULL,
  row_pk        VARCHAR(64)  NOT NULL,
  action        ENUM('insert','update','delete') NOT NULL,
  done_by       BINARY(16)   NULL,
  done_at       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_audit_target (table_name, row_pk)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE entity_change_log (
  id            BIGINT       NOT NULL AUTO_INCREMENT,
  audit_event_id BIGINT      NOT NULL,
  column_name   VARCHAR(64)  NOT NULL,
  old_value     TEXT         NULL,
  new_value     TEXT         NULL,
  PRIMARY KEY (id),
  KEY ix_change_event (audit_event_id),
  CONSTRAINT fk_change_event FOREIGN KEY (audit_event_id) REFERENCES audit_event (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Per-row migration provenance (complements legacy_source/legacy_id columns)
CREATE TABLE legacy_source_record (
  id            BIGINT       NOT NULL AUTO_INCREMENT,
  entity        VARCHAR(64)  NOT NULL,
  new_id        BINARY(16)   NOT NULL,
  source_db     VARCHAR(64)  NOT NULL,         -- hcmuser<N>
  legacy_table  VARCHAR(64)  NOT NULL,
  legacy_id     VARCHAR(64)  NOT NULL,
  migrated_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_lsr_new (entity, new_id),
  KEY ix_lsr_legacy (source_db, legacy_table, legacy_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
