-- Phase F-3: quoting (legacy Step1–5 wizard semantics — census-based proposals).
-- Replaces the legacy selectedplan/offerplan/recommendedplan trio with one clean
-- Quote → QuoteLine model; lines aggregate the census-composition costs per plan.
CREATE TABLE quote (
  id            BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  plan_year_id  BINARY(16)   NOT NULL,
  created_by    BINARY(16)   NULL,
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  status        ENUM('draft','presented','accepted') NOT NULL DEFAULT 'draft',
  census_count  INT          NOT NULL DEFAULT 0,     -- active employees costed
  legacy_id     INT          NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_quote_plan_year FOREIGN KEY (plan_year_id) REFERENCES plan_year (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE quote_line (
  id            BINARY(16)   NOT NULL DEFAULT (UUID_TO_BIN(UUID())),
  quote_id      BINARY(16)   NOT NULL,
  benefit_plan_id BINARY(16) NOT NULL,
  monthly_total DECIMAL(12,2) NOT NULL,
  employer_cost DECIMAL(12,2) NOT NULL,
  employee_cost DECIMAL(12,2) NOT NULL,
  costed_employees INT       NOT NULL DEFAULT 0,     -- employees the plan could cost (tier offered)
  PRIMARY KEY (id),
  KEY ix_quote_line (quote_id),
  CONSTRAINT fk_qline_quote FOREIGN KEY (quote_id) REFERENCES quote (id) ON DELETE CASCADE,
  CONSTRAINT fk_qline_plan  FOREIGN KEY (benefit_plan_id) REFERENCES benefit_plan (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
