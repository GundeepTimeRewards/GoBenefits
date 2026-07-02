-- GoBenefits V4 — Per-customer seed / reference data
-- Applied to EVERY tenant DB (life_event_type lives per-customer so life_event
-- can FK to it). Idempotent via the unique natural key (key_name).
--
-- Other reference data (roles, permissions, benefit_type, setup steps) is shared
-- and lives in the control-plane seed (control-plane/0002_seed_reference_data.sql).
SET NAMES utf8mb4;

-- ===========================================================================
-- Life event types
--   documentation_required : is supporting documentation usually required?
--   review_required        : does HR/admin review by default?
--   effective_date_rule    : default coverage effective-date behavior
-- ===========================================================================
INSERT INTO life_event_type
  (key_name, label, description, documentation_required, review_required, effective_date_rule) VALUES
  ('marriage',                   'Marriage',                       'Add spouse or change coverage after marriage.',              1, 1, 'first_of_following_month'),
  ('divorce',                    'Divorce',                        'Remove spouse or update coverage after divorce/separation.', 1, 1, 'first_of_following_month'),
  ('birth_adoption',             'Birth / Adoption',               'Add a child after birth, adoption, or placement.',           1, 1, 'event_date'),
  ('death_of_dependent',         'Death of Dependent',             'Remove a dependent after death.',                            1, 1, 'event_date'),
  ('loss_of_coverage',           'Loss of Other Coverage',         'Enroll after losing coverage from another source.',          1, 1, 'day_after_loss'),
  ('gain_of_coverage',           'Gain of Other Coverage',         'Drop or waive coverage after gaining coverage elsewhere.',   1, 1, 'first_of_following_month'),
  ('employment_status_change',   'Change in Employment Status',    'Change in hours, class, or employment status.',              0, 1, 'first_of_following_month'),
  ('residence_change',           'Change in Residence',            'Address change that may affect plan eligibility.',           0, 1, 'first_of_following_month'),
  ('dependent_eligibility_change','Dependent Eligibility Change',  'Dependent gains/loses eligibility (e.g. aging out).',        1, 1, 'event_date'),
  ('court_order_qmcso',          'Court Order / QMCSO',            'Coverage change required by court order or QMCSO.',          1, 1, 'event_date'),
  ('medicare_medicaid_change',   'Medicare / Medicaid Change',     'Gain or loss of Medicare/Medicaid eligibility.',             1, 1, 'event_date'),
  ('other',                      'Other Qualifying Life Event',    'Another qualifying event submitted for review.',             1, 1, 'event_date')
ON DUPLICATE KEY UPDATE
  label = VALUES(label), description = VALUES(description),
  documentation_required = VALUES(documentation_required),
  review_required = VALUES(review_required),
  effective_date_rule = VALUES(effective_date_rule);
