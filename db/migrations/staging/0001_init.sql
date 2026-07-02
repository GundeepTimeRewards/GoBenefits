-- GoBenefits V4 — Migration STAGING schema v1
-- A separate staging area (own schema/DB). Legacy data lands here AS-IS, is
-- profiled/validated, then transformed into the per-customer DBs.
-- Engine: Aurora MySQL 8.0. Loose typing on raw mirrors (everything nullable
-- text) — we do NOT enforce constraints here; that's the target model's job.
-- The migration_batch / migration_mapping / migration_exception control tables
-- live in the CONTROL-PLANE DB (see control-plane/0001_init.sql).
SET NAMES utf8mb4;

-- ===========================================================================
-- Raw legacy mirrors (stg_*) — 1:1 with legacy tables, loaded verbatim.
-- Common columns on every mirror: source_db (hcmuser<N>) + loaded_at + a raw
-- JSON copy of the full source row so nothing is lost even if columns change.
-- Below: the high-value mirrors. Add more stg_* as needed per legacy table.
-- ===========================================================================

CREATE TABLE stg_employee (
  staging_id    BIGINT       NOT NULL AUTO_INCREMENT,
  source_db     VARCHAR(64)  NOT NULL,
  legacy_id     INT          NULL,             -- legacy employee.EmployeeID
  first_name    VARCHAR(255) NULL,
  last_name     VARCHAR(255) NULL,
  date_of_birth VARCHAR(64)  NULL,             -- text: dates are dirty in legacy
  ssn           VARCHAR(64)  NULL,
  email         VARCHAR(320) NULL,
  employee_status VARCHAR(64) NULL,
  hire_date     VARCHAR(64)  NULL,
  cobra         VARCHAR(16)  NULL,
  raw_json      JSON         NULL,             -- full source row
  loaded_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (staging_id),
  KEY ix_stg_emp (source_db, legacy_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE stg_dependent (
  staging_id    BIGINT       NOT NULL AUTO_INCREMENT,
  source_db     VARCHAR(64)  NOT NULL,
  legacy_id     INT          NULL,
  legacy_employee_id INT     NULL,
  first_name    VARCHAR(255) NULL,
  last_name     VARCHAR(255) NULL,
  relationship  VARCHAR(64)  NULL,
  date_of_birth VARCHAR(64)  NULL,
  raw_json      JSON         NULL,
  loaded_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (staging_id),
  KEY ix_stg_dep (source_db, legacy_employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE stg_planenrollment (
  staging_id    BIGINT       NOT NULL AUTO_INCREMENT,
  source_db     VARCHAR(64)  NOT NULL,
  legacy_id     INT          NULL,
  legacy_employee_id INT     NULL,
  legacy_plan_id INT         NULL,
  legacy_dependent_id INT    NULL,
  coverage_tier VARCHAR(64)  NULL,
  enrollment_status VARCHAR(64) NULL,
  premium       VARCHAR(64)  NULL,
  company_contribution VARCHAR(64) NULL,
  source_table  VARCHAR(32)  NULL,             -- 'planenrollment' or 'employeeplanselection'
  raw_json      JSON         NULL,
  loaded_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (staging_id),
  KEY ix_stg_enroll (source_db, legacy_employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE stg_plan (
  staging_id    BIGINT       NOT NULL AUTO_INCREMENT,
  source_db     VARCHAR(64)  NOT NULL,
  legacy_id     INT          NULL,
  source_table  VARCHAR(32)  NULL,             -- plan/clientplan/userplan/medicalplan/newplan
  plan_name     VARCHAR(255) NULL,
  plan_code     VARCHAR(64)  NULL,
  plan_type     VARCHAR(64)  NULL,
  raw_json      JSON         NULL,
  loaded_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (staging_id),
  KEY ix_stg_plan (source_db, legacy_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE stg_planpricing (
  staging_id    BIGINT       NOT NULL AUTO_INCREMENT,
  source_db     VARCHAR(64)  NOT NULL,
  legacy_plan_id INT         NULL,
  age           VARCHAR(16)  NULL,
  premium       VARCHAR(64)  NULL,             -- EE-only
  es            VARCHAR(64)  NULL,
  ec            VARCHAR(64)  NULL,
  ef            VARCHAR(64)  NULL,
  effective_date VARCHAR(64) NULL,
  raw_json      JSON         NULL,
  loaded_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (staging_id),
  KEY ix_stg_pricing (source_db, legacy_plan_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE stg_payrolldeduction (
  staging_id    BIGINT       NOT NULL AUTO_INCREMENT,
  source_db     VARCHAR(64)  NOT NULL,
  legacy_id     INT          NULL,
  legacy_employee_id INT     NULL,
  plan          VARCHAR(255) NULL,
  pre_post_tax  VARCHAR(16)  NULL,
  cost_ee       VARCHAR(64)  NULL,
  cost_er       VARCHAR(64)  NULL,
  cost_total    VARCHAR(64)  NULL,
  pay_cycle     VARCHAR(32)  NULL,
  raw_json      JSON         NULL,
  loaded_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (staging_id),
  KEY ix_stg_deduction (source_db, legacy_employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE stg_contributionclass (
  staging_id    BIGINT       NOT NULL AUTO_INCREMENT,
  source_db     VARCHAR(64)  NOT NULL,
  legacy_id     INT          NULL,
  name          VARCHAR(255) NULL,
  raw_json      JSON         NULL,             -- all Contribution4* columns
  loaded_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (staging_id),
  KEY ix_stg_contrib (source_db, legacy_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE stg_document (
  staging_id    BIGINT       NOT NULL AUTO_INCREMENT,
  source_db     VARCHAR(64)  NOT NULL,
  legacy_id     INT          NULL,
  source_table  VARCHAR(32)  NULL,             -- document / pdfform
  file_name     VARCHAR(512) NULL,
  legacy_path   VARCHAR(1024) NULL,
  document_type VARCHAR(64)  NULL,
  legacy_employee_id INT     NULL,
  signed_date   VARCHAR(64)  NULL,
  raw_json      JSON         NULL,
  loaded_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (staging_id),
  KEY ix_stg_doc (source_db, legacy_employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===========================================================================
-- Import column mapping (was legacy employeecolumnmap) — for census/payroll import
-- ===========================================================================

CREATE TABLE column_map (
  id            BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  import_kind   ENUM('census','payroll') NOT NULL,
  source_column VARCHAR(128) NOT NULL,
  target_field  VARCHAR(128) NOT NULL,
  source_db     VARCHAR(64)  NULL,             -- null = global default mapping
  PRIMARY KEY (id),
  KEY ix_colmap_kind (import_kind, source_db)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===========================================================================
-- Reconciliation views — counts/quality per source_db (read by migration reports)
-- ===========================================================================

CREATE OR REPLACE VIEW v_recon_counts AS
SELECT source_db, 'employee'         AS entity, COUNT(*) AS rows FROM stg_employee        GROUP BY source_db
UNION ALL
SELECT source_db, 'dependent'        AS entity, COUNT(*) AS rows FROM stg_dependent       GROUP BY source_db
UNION ALL
SELECT source_db, 'enrollment'       AS entity, COUNT(*) AS rows FROM stg_planenrollment  GROUP BY source_db
UNION ALL
SELECT source_db, 'payroll_deduction' AS entity, COUNT(*) AS rows FROM stg_payrolldeduction GROUP BY source_db;

-- Orphaned dependents (no matching employee in the same source_db)
CREATE OR REPLACE VIEW v_orphan_dependents AS
SELECT d.source_db, d.legacy_id, d.legacy_employee_id
FROM stg_dependent d
LEFT JOIN stg_employee e
  ON e.source_db = d.source_db AND e.legacy_id = d.legacy_employee_id
WHERE e.legacy_id IS NULL;

-- Duplicate employees by SSN within a source_db
CREATE OR REPLACE VIEW v_duplicate_employees AS
SELECT source_db, ssn, COUNT(*) AS cnt
FROM stg_employee
WHERE ssn IS NOT NULL AND ssn <> ''
GROUP BY source_db, ssn
HAVING COUNT(*) > 1;
