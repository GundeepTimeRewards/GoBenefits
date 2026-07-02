// Mock data for the EMPLOYEE self-service area (/employee/*). Separate from the
// HR-admin mock — employee self-service uses row-level "own records only"
// authorization later (NOT implemented in the FE; see FRONTEND_API_CONTRACT_GAPS.md).

export const myProfile = {
  name: "Jordan Lee",
  employerName: "Acme Manufacturing",
  planYearLabel: "2027 Benefits",
  enrollmentWindow: "Nov 1 – Nov 20, 2026",
  effectiveDate: "Jan 1, 2027",
  daysLeft: 14,
  status: "In Progress" as const,
};

export type SelfBenefit = {
  line: string;
  plan: string | null;
  tier: string | null;
  perPay: number | null;
  status: "Selected" | "Waived" | "Not Started" | "Employer Paid" | "Action Needed";
};

export const myBenefits: SelfBenefit[] = [
  { line: "Medical", plan: "UHC Choice Plus PPO", tier: "Family", perPay: 168.0, status: "Selected" },
  { line: "Dental", plan: "Guardian Dental PPO", tier: "Family", perPay: 24.18, status: "Selected" },
  { line: "Vision", plan: null, tier: null, perPay: 0, status: "Waived" },
  { line: "Basic Life", plan: "MetLife Basic Life", tier: "Employee", perPay: 0, status: "Employer Paid" },
  { line: "Voluntary Life", plan: null, tier: null, perPay: null, status: "Action Needed" },
];

export const myComparePlans = [
  { id: "uhc-ppo", name: "UHC Choice Plus PPO", network: "Nationwide PPO", perPay: 168.0, deductible: "$3,000 / $6,000", oop: "$7,000 / $14,000", hsa: false },
  { id: "uhc-hdhp", name: "UHC HDHP HSA", network: "Nationwide PPO", perPay: 124.06, deductible: "$5,000 / $10,000", oop: "$6,800 / $13,600", hsa: true },
  { id: "uhc-value", name: "UHC Value Network", network: "Regional EPO", perPay: 99.22, deductible: "$4,500 / $9,000", oop: "$8,000 / $16,000", hsa: false },
];

export const coverageTiers = [
  { key: "ee", label: "Employee Only" },
  { key: "ee_spouse", label: "Employee + Spouse" },
  { key: "ee_child", label: "Employee + Child(ren)" },
  { key: "family", label: "Family" },
];

export const myDependents = [
  { dependentId: "dep-1", firstName: "Taylor", lastName: "Lee", dateOfBirth: "1987-08-09", gender: "F", relationship: "spouse" as const, disabled: false, student: false, coveredStatus: "covered" as const },
  { dependentId: "dep-2", firstName: "Avery", lastName: "Lee", dateOfBirth: "2016-02-18", gender: "F", relationship: "child" as const, disabled: false, student: true, coveredStatus: "covered" as const },
];

export const myDocuments = [
  { id: "d1", name: "2027 Benefits Guide.pdf", category: "Plan Document", date: "Oct 1, 2026" },
  { id: "d2", name: "My 2027 Enrollment Confirmation.pdf", category: "Confirmation", date: "Nov 6, 2026" },
];

export const myLifeEvents = [
  { id: "le1", type: "Marriage", date: "Jun 6, 2026", status: "Completed", documents: "Verified" },
  { id: "le2", type: "Loss of Other Coverage", date: "—", status: "Draft", documents: "Missing" },
];

export const enrollSteps = ["Profile", "Dependents", "Compare", "Elect", "Beneficiary", "Review"] as const;

// --- Report Life Event (employee self-service wizard) -----------------------
export const reportLifeEventSteps = ["Event Type", "Event Details", "Affected People", "Documents", "Review & Submit"] as const;

export type LifeEventPeopleMode = "add_dependent" | "select_dependent" | "self";
export type LifeEventTypeDef = {
  key: string; name: string; description: string; iconKey: string;
  deadlineDays?: number; docs: string[]; people: LifeEventPeopleMode;
};
export const lifeEventTypes: LifeEventTypeDef[] = [
  { key: "marriage", name: "Marriage", description: "You got married and want to add a spouse.", iconKey: "heart", deadlineDays: 30, docs: ["Marriage certificate"], people: "add_dependent" },
  { key: "divorce", name: "Divorce / Legal Separation", description: "You divorced or legally separated.", iconKey: "heart-crack", deadlineDays: 30, docs: ["Divorce decree"], people: "select_dependent" },
  { key: "birth", name: "Birth or Adoption", description: "You had a baby or adopted a child.", iconKey: "baby", deadlineDays: 30, docs: ["Birth certificate or adoption papers"], people: "add_dependent" },
  { key: "loss-coverage", name: "Loss of Other Coverage", description: "You or a dependent lost other health coverage.", iconKey: "shield-off", deadlineDays: 30, docs: ["Proof of loss of coverage (e.g., COBRA or termination letter)"], people: "self" },
  { key: "gain-coverage", name: "Gain of Other Coverage", description: "You or a dependent gained other coverage.", iconKey: "shield-check", deadlineDays: 30, docs: ["Proof of new coverage"], people: "self" },
  { key: "death", name: "Death of Dependent", description: "A covered dependent passed away.", iconKey: "user-x", deadlineDays: 30, docs: ["Death certificate"], people: "select_dependent" },
  { key: "aging-out", name: "Dependent Aging Out", description: "A dependent no longer meets age eligibility.", iconKey: "cake", deadlineDays: 30, docs: [], people: "select_dependent" },
  { key: "address", name: "Address Change", description: "You moved and your plan availability may change.", iconKey: "map-pin", docs: ["Proof of address (if required)"], people: "self" },
  { key: "employment", name: "Employment Status Change", description: "Your hours or employment status changed.", iconKey: "briefcase", docs: ["Employment status letter (if required)"], people: "self" },
  { key: "other", name: "Other", description: "Another qualifying event not listed here.", iconKey: "help-circle", docs: ["Supporting documentation"], people: "self" },
];
