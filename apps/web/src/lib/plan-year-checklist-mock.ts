// Plan Year Setup checklist mock — aligned to the derived-readiness model
// (../../docs/DATA_MODEL.md §10.1). Step DEFINITIONS mirror the seeded
// plan_year_setup_step_definition catalog; STATUS is mock here but is DERIVED
// from real domain entities server-side later. `overrideNote` mirrors
// plan_year_setup_step_override. `route` is an employer-scoped route PATTERN;
// the component supplies the employerId param.

export type ReadinessStatus =
  | "not_started"
  | "in_progress"
  | "complete"
  | "needs_attention"
  | "blocked"
  | "not_applicable";

export type ChecklistStep = {
  stepKey: string;
  label: string;
  description: string;
  category: string;
  requiredByDefault: boolean;
  route: string; // route pattern, e.g. "/employers/$employerId/census"
  status: ReadinessStatus; // DERIVED later
  message?: string;
  overrideNote?: string;
};

export const readinessMeta: Record<ReadinessStatus, { label: string; tone: string }> = {
  not_started: { label: "Not started", tone: "bg-muted text-muted-foreground border-border" },
  in_progress: { label: "In progress", tone: "bg-info/15 text-info border-info/30" },
  complete: { label: "Complete", tone: "bg-success/15 text-success border-success/30" },
  needs_attention: { label: "Needs attention", tone: "bg-warning/20 text-warning-foreground border-warning/40" },
  blocked: { label: "Blocked", tone: "bg-destructive/15 text-destructive border-destructive/30" },
  not_applicable: { label: "Not applicable", tone: "bg-muted text-muted-foreground border-border" },
};

const R = "/employers/$employerId";

export const planYearChecklist: ChecklistStep[] = [
  { stepKey: "census_imported", label: "Census imported / reviewed", description: "Employee & dependent census loaded and reviewed.", category: "People", requiredByDefault: true, route: `${R}/census`, status: "complete" },
  { stepKey: "classes_configured", label: "Employee classes configured", description: "Employee/eligibility classes defined.", category: "People", requiredByDefault: true, route: `${R}/eligibility-contributions`, status: "complete" },
  { stepKey: "eligibility_configured", label: "Eligibility rules configured", description: "Eligibility criteria & waiting periods set.", category: "People", requiredByDefault: true, route: `${R}/eligibility-contributions`, status: "in_progress" },
  { stepKey: "plans_configured", label: "Benefit plans configured", description: "At least one active plan per line with required fields.", category: "Plan Setup", requiredByDefault: true, route: `${R}/benefit-plans`, status: "in_progress" },
  { stepKey: "options_configured", label: "Plan options configured", description: "Plan options / riders / tiers configured.", category: "Plan Setup", requiredByDefault: false, route: `${R}/benefit-plans`, status: "not_started" },
  { stepKey: "rates_configured", label: "Rates configured", description: "Valid rates loaded for all plans requiring them.", category: "Rates & Contributions", requiredByDefault: true, route: `${R}/benefit-plans`, status: "needs_attention", message: "Vision plan rates not loaded for the family tier." },
  { stepKey: "contributions_configured", label: "Employer contributions configured", description: "Employer contribution rules set per class.", category: "Rates & Contributions", requiredByDefault: true, route: `${R}/eligibility-contributions`, status: "in_progress" },
  { stepKey: "window_configured", label: "Enrollment window configured", description: "Enrollment event with start/end dates.", category: "Enrollment", requiredByDefault: true, route: `${R}/enrollment-events`, status: "complete" },
  { stepKey: "communications_configured", label: "Employee communications configured", description: "Notices / email templates / messages prepared.", category: "Communications", requiredByDefault: true, route: `${R}/documents`, status: "not_started" },
  { stepKey: "documents_configured", label: "Documents / forms configured", description: "Required documents and forms uploaded.", category: "Communications", requiredByDefault: true, route: `${R}/documents`, status: "in_progress" },
  { stepKey: "invitations_sent", label: "Enrollment invitations sent", description: "Eligible employees invited to enroll.", category: "Enrollment", requiredByDefault: true, route: `${R}/enrollment-progress`, status: "not_started", message: "32 eligible employees not yet invited." },
  { stepKey: "elections_reviewed", label: "Employee elections reviewed", description: "Submitted elections reviewed.", category: "Enrollment", requiredByDefault: true, route: `${R}/enrollment-progress`, status: "not_started" },
  { stepKey: "waivers_reviewed", label: "Waivers reviewed", description: "Coverage waivers reviewed.", category: "Enrollment", requiredByDefault: false, route: `${R}/enrollment-progress`, status: "not_applicable", overrideNote: "Marked N/A by admin — no waivers expected this year." },
  { stepKey: "payroll_reviewed", label: "Payroll deductions reviewed", description: "Deduction amounts reviewed before export.", category: "Payroll", requiredByDefault: true, route: `${R}/payroll-deductions`, status: "not_started" },
  { stepKey: "carrier_exports_configured", label: "Carrier exports configured", description: "Carrier export profiles / field mappings set.", category: "Carrier", requiredByDefault: true, route: `${R}/carrier-exports`, status: "needs_attention", message: "Guardian Dental export profile missing." },
  { stepKey: "carrier_exports_generated", label: "Carrier exports generated", description: "Required carrier export files generated/sent/approved.", category: "Carrier", requiredByDefault: true, route: `${R}/carrier-exports`, status: "blocked", message: "Blocked until rates and carrier profiles are complete." },
  { stepKey: "readiness_review", label: "Final audit / readiness review", description: "Final go-live readiness check.", category: "Readiness", requiredByDefault: true, route: `${R}/plan-years`, status: "not_started" },
];
