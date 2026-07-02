// Shared mock data for the broader screen set. Mock-only; field names lean toward
// the backend GraphQL/domain shapes where they exist (see ../../api/schema.graphql
// and ../../docs/DATA_MODEL.md). UI-derived/placeholder values are used freely here.

import { UserCheck, ClipboardCheck, AlertCircle, FileUp, Building2, CalendarClock, Users } from "lucide-react";

export const dashboardKpis = [
  { label: "Eligible Employees", value: "482", icon: UserCheck },
  { label: "Enrollment Complete", value: "309", tone: "text-success", icon: ClipboardCheck, iconClass: "bg-success/10 text-success" },
  { label: "Not Started", value: "126", tone: "text-warning", icon: AlertCircle, iconClass: "bg-warning/15 text-warning" },
  { label: "Carrier Files Pending", value: "4", tone: "text-warning", icon: FileUp, iconClass: "bg-warning/15 text-warning" },
];

export const dashboardActivity = [
  { who: "Maria Patel", action: "submitted elections", when: "22m ago" },
  { who: "System", action: "generated Anthem carrier export", when: "1h ago" },
  { who: "Jordan Lee", action: "added a dependent", when: "2h ago" },
  { who: "Alex Romero", action: "approved dental rates", when: "3h ago" },
];

export const dashboardAttention = [
  { title: "Vision rates missing for family tier", tone: "danger" as const },
  { title: "32 eligible employees not yet invited", tone: "warning" as const },
  { title: "Guardian Dental carrier export profile missing", tone: "warning" as const },
];

export const planYears = [
  { id: "py-2027", label: "2027 Benefits", status: "Setup", period: "Jan 1 – Dec 31, 2027", oe: "Nov 1 – Nov 20, 2026", eligible: 482, plans: 18, completion: 64 },
  { id: "py-2026", label: "2026 Benefits", status: "Active", period: "Jan 1 – Dec 31, 2026", oe: "Closed", eligible: 468, plans: 14, completion: 100 },
  { id: "py-2025", label: "2025 Benefits", status: "Archived", period: "Jan 1 – Dec 31, 2025", oe: "Closed", eligible: 441, plans: 12, completion: 100 },
];

export const benefitPlans = [
  { id: "p1", line: "Medical", name: "UHC Choice Plus PPO", carrier: "UnitedHealthcare", subtype: "PPO", enrolled: 312, status: "Active" },
  { id: "p2", line: "Medical", name: "UHC HDHP HSA", carrier: "UnitedHealthcare", subtype: "HDHP", enrolled: 96, status: "Active" },
  { id: "p3", line: "Dental", name: "Guardian Dental PPO", carrier: "Guardian", subtype: "PPO", enrolled: 298, status: "Active" },
  { id: "p4", line: "Vision", name: "VSP Choice", carrier: "VSP", subtype: "PPO", enrolled: 241, status: "Needs Attention" },
  { id: "p5", line: "Basic Life", name: "MetLife Basic Life", carrier: "MetLife", subtype: "Flat", enrolled: 309, status: "Active" },
  { id: "p6", line: "Voluntary Life", name: "MetLife Voluntary Life", carrier: "MetLife", subtype: "Age-banded", enrolled: 142, status: "Needs Attention" },
];

export const eligibilityClasses = [
  { id: "c1", name: "Full-Time", criteria: "≥ 30 hrs/week", waiting: "1st of month after 30 days", coverages: "Medical, Dental, Vision, Life", employees: 410, status: "Complete" },
  { id: "c2", name: "Part-Time Eligible", criteria: "20–29 hrs/week", waiting: "1st of month after 60 days", coverages: "Medical, Dental", employees: 48, status: "Complete" },
  { id: "c3", name: "Seasonal", criteria: "Variable hours", waiting: "Measurement period", coverages: "—", employees: 24, status: "Needs Attention" },
];

export const contributionRules = [
  { id: "r1", class: "Full-Time", medical: "80% EE / 50% Dep", dental: "100% EE / 0% Dep", vision: "100% EE", life: "Employer paid" },
  { id: "r2", class: "Part-Time Eligible", medical: "50% EE / 0% Dep", dental: "50% EE / 0% Dep", vision: "0%", life: "—" },
];

export const enrollmentEvents = [
  { id: "e1", name: "2027 Open Enrollment", type: "Open Enrollment", window: "Nov 1 – Nov 20, 2026", effective: "Jan 1, 2027", status: "Scheduled" },
  { id: "e2", name: "New Hire — rolling", type: "New Hire", window: "Within 30 days of hire", effective: "1st of following month", status: "Active" },
];

export const enrollmentProgress = {
  invited: 450,
  notInvited: 32,
  notStarted: 126,
  inProgress: 47,
  submitted: 309,
  byCoverage: [
    { name: "Medical", elected: 312, waived: 44, pending: 126 },
    { name: "Dental", elected: 298, waived: 58, pending: 126 },
    { name: "Vision", elected: 241, waived: 115, pending: 126 },
  ],
};

export const lifeEvents = [
  { id: "le1", employee: "Jordan Lee", type: "Birth / Adoption", date: "Mar 12, 2027", status: "Approved", documents: "Verified", impact: "Add dependent, change tier" },
  { id: "le2", employee: "Maria Patel", type: "Marriage", date: "Feb 4, 2027", status: "Needs Documents", documents: "Certificate missing", impact: "Add spouse" },
  { id: "le3", employee: "Dana Kim", type: "Divorce", date: "Jan 8, 2027", status: "Approved", documents: "Verified", impact: "Remove spouse" },
];

export const payrollDeductions = [
  { id: "d1", employee: "Jordan Lee", plan: "UHC PPO", preTax: true, ee: 142.5, er: 320.0, cycle: "Biweekly", status: "Ready" },
  { id: "d2", employee: "Maria Patel", plan: "UHC PPO", preTax: true, ee: 168.0, er: 320.0, cycle: "Biweekly", status: "Ready" },
  { id: "d3", employee: "Dana Kim", plan: "Guardian Dental", preTax: true, ee: 18.2, er: 22.0, cycle: "Monthly", status: "Needs Review" },
];

export const carrierBatches = [
  { id: "b1", carrier: "UnitedHealthcare", format: "EDI 834", lines: 408, errors: 0, status: "Sent", generated: "Dec 15, 2026" },
  { id: "b2", carrier: "Guardian", format: "CSV", lines: 298, errors: 2, status: "Needs Attention", generated: "Dec 15, 2026" },
  { id: "b3", carrier: "VSP", format: "EDI 834", lines: 0, errors: 0, status: "Not Started", generated: "—" },
];

export const aleMonths = [
  { month: "Jan", ft: 410, fte: 38.5, total: 448, isAle: true },
  { month: "Feb", ft: 412, fte: 37.0, total: 449, isAle: true },
  { month: "Mar", ft: 415, fte: 36.2, total: 451, isAle: true },
];

export const form1095Summary = { generated: 482, filed: 0, corrections: 0, status: "Draft" };

export const cobraEvents = [
  { id: "cb1", person: "Chris Wong", relationship: "Employee", event: "Termination", date: "Jan 20, 2027", notice: "Feb 3, 2027", status: "Election Window Open", payment: "Not Elected" },
  { id: "cb2", person: "Dana Kim", relationship: "Employee", event: "Reduction in Hours", date: "Feb 1, 2027", notice: "Feb 15, 2027", status: "Notice Due", payment: "—" },
  { id: "cb3", person: "Olivia Martin", relationship: "Employee", event: "Termination", date: "Dec 12, 2026", notice: "Dec 26, 2026", status: "COBRA Elected", payment: "Current" },
];

export const documents = [
  { id: "doc1", name: "2027 Benefits Guide.pdf", category: "Communication", related: "All employees", uploaded: "Oct 1, 2026" },
  { id: "doc2", name: "Jordan Lee — Enrollment Form.pdf", category: "Signed Form", related: "Jordan Lee", uploaded: "Nov 5, 2026" },
  { id: "doc3", name: "Marriage Certificate.pdf", category: "Life Event", related: "Maria Patel", uploaded: "Feb 6, 2027" },
];

// --- Agency / Broker (book of business) -------------------------------------
export const agencies = [
  { id: "ag-northwind", name: "Northwind Benefits Group", brokers: 6, employers: 24, employees: 3184, status: "Active" },
  { id: "ag-summit", name: "Summit Advisors", brokers: 2, employers: 8, employees: 940, status: "Active" },
];

export const agencyBrokers = [
  { id: "br-1", name: "Alex Romero", employers: 9, employees: 1240, status: "Active" },
  { id: "br-2", name: "Sam Carter", employers: 7, employees: 980, status: "Active" },
  { id: "br-3", name: "Priya Nair", employers: 8, employees: 964, status: "Active" },
];

// Employer rows for the broker book-of-business + employer list screens.
export const employers = [
  { id: "acme", name: "Acme Manufacturing", planYear: "2027 Benefits", status: "Open Enrollment", employees: 482, completion: 64, renewal: "Jan 1, 2027", issues: 3 },
  { id: "brightpath", name: "BrightPath Services", planYear: "2026 Benefits", status: "Active", employees: 128, completion: 100, renewal: "Jul 1, 2026", issues: 0 },
  { id: "northstar", name: "Northstar Dental Group", planYear: "2027 Benefits", status: "Setup", employees: 64, completion: 22, renewal: "Mar 1, 2027", issues: 5 },
  { id: "summit-np", name: "Summit Nonprofit Alliance", planYear: "2027 Benefits", status: "Open Enrollment", employees: 212, completion: 81, renewal: "Jan 1, 2027", issues: 1 },
  { id: "lakeside", name: "Lakeside Hospitality", planYear: "2026 Benefits", status: "Active", employees: 340, completion: 100, renewal: "Oct 1, 2026", issues: 0 },
];

export const brokerKpis = [
  { label: "Active Employers", value: "24", icon: Building2 },
  { label: "Open Enrollments", value: "7", tone: "text-info", icon: CalendarClock, iconClass: "bg-info/10 text-info" },
  { label: "Employees Enrolling", value: "3,184", icon: Users },
  { label: "Carrier Files Pending", value: "12", tone: "text-warning", icon: FileUp, iconClass: "bg-warning/15 text-warning" },
];

// Cross-client worklist items for the broker Book-of-Business dashboard.
export const bookNeedsAttention = [
  { employer: "Northstar Dental Group", detail: "5 open issues · setup 22% complete", tone: "danger" as const },
  { employer: "Acme Manufacturing", detail: "Vision rates missing · 32 not invited", tone: "warning" as const },
  { employer: "Summit Nonprofit Alliance", detail: "Carrier export validation: 4 SSN mismatches", tone: "warning" as const },
];

export const upcomingRenewals = [
  { employer: "BrightPath Services", date: "Jul 1, 2026", days: 12 },
  { employer: "Lakeside Hospitality", date: "Oct 1, 2026", days: 104 },
  { employer: "Acme Manufacturing", date: "Jan 1, 2027", days: 197 },
];

// --- Elections review + waivers (HR admin) ----------------------------------
export const electionsReview = [
  { id: "el1", employee: "Maria Patel", plan: "UHC Choice Plus PPO", tier: "Family", dependents: 3, eeCost: 168.0, status: "Submitted", submitted: "Nov 6, 2026" },
  { id: "el2", employee: "Jordan Lee", plan: "UHC HDHP HSA", tier: "EE + Spouse", dependents: 1, eeCost: 96.0, status: "Submitted", submitted: "Nov 5, 2026" },
  { id: "el3", employee: "Devon Brooks", plan: "UHC Choice Plus PPO", tier: "Employee Only", dependents: 0, eeCost: 142.5, status: "Needs Review", submitted: "Nov 7, 2026" },
];

export const waivers = [
  { id: "w1", employee: "Chris Wong", line: "Medical", reason: "Covered under spouse's plan", other: "Aetna (spouse)", status: "Submitted" },
  { id: "w2", employee: "Sara Müller", line: "Vision", reason: "Declined", other: "—", status: "Submitted" },
];
