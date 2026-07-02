-- GoBenefits V4 — Control-plane DB schema v1 (full)
-- Shared database. Cross-customer data ONLY. No employer PII/PHI here.
-- Engine: Aurora MySQL 8.0. InnoDB, utf8mb4, real FKs.
SET NAMES utf8mb4;

-- ===========================================================================
-- Org hierarchy (NET-NEW — legacy had no agency/broker concept)
-- ===========================================================================

CREATE TABLE agency (
  id          BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  name        VARCHAR(255) NOT NULL,
  status      ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE broker (
  id          BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  agency_id   BINARY(16)   NOT NULL,
  name        VARCHAR(255) NOT NULL,
  email       VARCHAR(320) NULL,
  phone       VARCHAR(32)  NULL,
  status      ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_broker_agency (agency_id),
  CONSTRAINT fk_broker_agency FOREIGN KEY (agency_id) REFERENCES agency (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Employer = the tenant registry row (operational data lives in its own DB)
CREATE TABLE employer (
  id              BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  agency_id       BINARY(16)   NULL,          -- null = works directly with platform
  broker_id       BINARY(16)   NULL,
  legal_name      VARCHAR(255) NOT NULL,
  ein             VARCHAR(20)  NULL,
  status          ENUM('prospect','setup','active','archived') NOT NULL DEFAULT 'setup',
  db_name         VARCHAR(64)  NOT NULL,       -- per-customer database name
  db_cluster_ref  VARCHAR(255) NULL,          -- null = default shared cluster
  legacy_user_db  INT          NULL,          -- legacy hcmuser<N>
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_employer_db (db_name),
  KEY ix_employer_agency (agency_id),
  KEY ix_employer_broker (broker_id),
  CONSTRAINT fk_employer_agency FOREIGN KEY (agency_id) REFERENCES agency (id),
  CONSTRAINT fk_employer_broker FOREIGN KEY (broker_id) REFERENCES broker (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Employer HR/admin contacts (NET-NEW). Distinct from employees.
CREATE TABLE employer_contact (
  id          BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  employer_id BINARY(16)   NOT NULL,
  name        VARCHAR(255) NOT NULL,
  title       VARCHAR(128) NULL,
  email       VARCHAR(320) NULL,
  phone       VARCHAR(32)  NULL,
  is_primary  TINYINT(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY ix_contact_employer (employer_id),
  CONSTRAINT fk_contact_employer FOREIGN KEY (employer_id) REFERENCES employer (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===========================================================================
-- Identity + RBAC
-- ===========================================================================

CREATE TABLE role (
  id          BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  key_name    VARCHAR(64)  NOT NULL,           -- super_admin, support, agency_admin, broker, employer_admin, employee
  label       VARCHAR(128) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_role_key (key_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE permission (
  id          BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  key_name    VARCHAR(128) NOT NULL,           -- e.g. employee.read, election.write, export.run
  label       VARCHAR(255) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_permission_key (key_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE role_permission (
  role_id       BINARY(16) NOT NULL,
  permission_id BINARY(16) NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_rp_role FOREIGN KEY (role_id) REFERENCES role (id) ON DELETE CASCADE,
  CONSTRAINT fk_rp_perm FOREIGN KEY (permission_id) REFERENCES permission (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE user_account (
  id            BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  cognito_sub   VARCHAR(255) NOT NULL,
  email         VARCHAR(320) NOT NULL,
  display_name  VARCHAR(255) NULL,
  role_id       BINARY(16)   NOT NULL,
  agency_id     BINARY(16)   NULL,
  broker_id     BINARY(16)   NULL,
  status        ENUM('invited','active','disabled') NOT NULL DEFAULT 'invited',
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_cognito (cognito_sub),
  UNIQUE KEY uq_user_email (email),
  CONSTRAINT fk_user_role   FOREIGN KEY (role_id)   REFERENCES role (id),
  CONSTRAINT fk_user_agency FOREIGN KEY (agency_id) REFERENCES agency (id),
  CONSTRAINT fk_user_broker FOREIGN KEY (broker_id) REFERENCES broker (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Which employers a non-employee user may access (broker book of business, etc.)
CREATE TABLE user_employer_access (
  user_account_id BINARY(16) NOT NULL,
  employer_id     BINARY(16) NOT NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_account_id, employer_id),
  KEY ix_uea_employer (employer_id),
  CONSTRAINT fk_uea_user     FOREIGN KEY (user_account_id) REFERENCES user_account (id) ON DELETE CASCADE,
  CONSTRAINT fk_uea_employer FOREIGN KEY (employer_id)     REFERENCES employer (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===========================================================================
-- Global catalog + reference (shared; legacy duplicated these per tenant)
-- ===========================================================================

CREATE TABLE carrier (
  id          BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  name        VARCHAR(255) NOT NULL,
  legacy_id   INT          NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_carrier_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE benefit_type (
  id          BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  key_name    VARCHAR(64)  NOT NULL,           -- medical, dental, vision, rx, basic_life, vol_life, std, ltd, accident, critical_illness, hospital
  label       VARCHAR(128) NOT NULL,
  is_health   TINYINT(1)   NOT NULL DEFAULT 0, -- counts toward ACA/COBRA
  display_order SMALLINT   NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_benefit_type_key (key_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Shared checklist step catalog (display/config only — NOT completion truth)
CREATE TABLE plan_year_setup_step_definition (
  id                  BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  step_key            VARCHAR(64)  NOT NULL,
  label               VARCHAR(255) NOT NULL,
  description         VARCHAR(512) NULL,
  display_order       SMALLINT     NOT NULL DEFAULT 0,
  category            VARCHAR(64)  NULL,
  required_by_default TINYINT(1)   NOT NULL DEFAULT 1,
  applies_to          VARCHAR(128) NULL,       -- module/feature/employer-type filter
  route               VARCHAR(255) NULL,       -- UI link
  PRIMARY KEY (id),
  UNIQUE KEY uq_step_key (step_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===========================================================================
-- Aggregate read-model (event-fed; powers broker/agency dashboards)
-- ===========================================================================

CREATE TABLE customer_progress (
  employer_id        BINARY(16) NOT NULL,
  plan_year          SMALLINT   NOT NULL,
  eligible_count     INT        NOT NULL DEFAULT 0,
  enrolled_count     INT        NOT NULL DEFAULT 0,
  waived_count       INT        NOT NULL DEFAULT 0,
  not_started_count  INT        NOT NULL DEFAULT 0,
  updated_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (employer_id, plan_year),
  CONSTRAINT fk_progress_employer FOREIGN KEY (employer_id) REFERENCES employer (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===========================================================================
-- Migration control (cross-tenant)
-- ===========================================================================

CREATE TABLE migration_batch (
  id            BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  employer_id   BINARY(16)   NULL,             -- target employer (null until created)
  source_db     VARCHAR(64)  NOT NULL,         -- hcmuser<N>
  status        ENUM('pending','extracting','transforming','loading','complete','failed') NOT NULL DEFAULT 'pending',
  started_at    DATETIME(3)  NULL,
  finished_at   DATETIME(3)  NULL,
  counts_json   JSON         NULL,             -- per-entity migrated/exception counts
  notes         TEXT         NULL,
  PRIMARY KEY (id),
  KEY ix_migbatch_employer (employer_id),
  CONSTRAINT fk_migbatch_employer FOREIGN KEY (employer_id) REFERENCES employer (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- legacy key -> new id per entity (idempotent re-runs + traceability)
CREATE TABLE migration_mapping (
  id              BIGINT       NOT NULL AUTO_INCREMENT,
  migration_batch_id BINARY(16) NOT NULL,
  entity          VARCHAR(64)  NOT NULL,       -- e.g. employee, dependent, election
  legacy_id       VARCHAR(64)  NOT NULL,
  new_id          BINARY(16)   NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_mapping (migration_batch_id, entity, legacy_id),
  CONSTRAINT fk_mapping_batch FOREIGN KEY (migration_batch_id) REFERENCES migration_batch (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE migration_exception (
  id              BIGINT       NOT NULL AUTO_INCREMENT,
  migration_batch_id BINARY(16) NOT NULL,
  entity          VARCHAR(64)  NOT NULL,
  legacy_id       VARCHAR(64)  NULL,
  reason_code     VARCHAR(64)  NOT NULL,       -- duplicate, missing_required, invalid_date, orphan, ...
  detail          TEXT         NULL,
  payload_json    JSON         NULL,           -- offending source row
  resolved        TINYINT(1)   NOT NULL DEFAULT 0,
  resolved_by     BINARY(16)   NULL,
  resolved_at     DATETIME(3)  NULL,
  PRIMARY KEY (id),
  KEY ix_exception_batch (migration_batch_id),
  CONSTRAINT fk_exception_batch FOREIGN KEY (migration_batch_id) REFERENCES migration_batch (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
