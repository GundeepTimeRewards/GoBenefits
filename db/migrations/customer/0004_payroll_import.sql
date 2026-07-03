-- Phase E-5: payroll data import staging (the IMPLEMENTATION_PLAN §3.2 tables the
-- 0001 schema never carried). Imported hours/wages per pay period feed the payroll
-- workspace and the ACA lookback measurement (approved into Phase E, 2026-07-03).
CREATE TABLE payroll_import_batch (
  id            BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  source        VARCHAR(64)  NOT NULL,          -- adp | bamboo | quickbooks | csv | manual
  file_name     VARCHAR(255) NULL,
  period_start  DATE         NOT NULL,
  period_end    DATE         NOT NULL,
  pay_date      DATE         NULL,
  status        ENUM('staged','imported','failed') NOT NULL DEFAULT 'imported',
  imported_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  row_count     INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE payroll_import_row (
  id            BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  batch_id      BINARY(16)   NOT NULL,
  employee_number VARCHAR(64) NULL,             -- raw provider match key
  employee_id   BINARY(16)   NULL,              -- resolved census match (NULL = unmatched)
  hours         DECIMAL(8,2) NULL,
  wages         DECIMAL(12,2) NULL,
  error         VARCHAR(512) NULL,
  PRIMARY KEY (id),
  KEY ix_pir_batch (batch_id),
  KEY ix_pir_employee (employee_id),
  CONSTRAINT fk_pir_batch    FOREIGN KEY (batch_id) REFERENCES payroll_import_batch (id) ON DELETE CASCADE,
  CONSTRAINT fk_pir_employee FOREIGN KEY (employee_id) REFERENCES employee (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
