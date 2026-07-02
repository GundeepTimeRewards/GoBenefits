// API-shaped mock data for the Census + Employee Detail + Dependents screens.
// Field names/types mirror the backend GraphQL contract (../../api/schema.graphql)
// so swapping mock -> AppSync later is a 1:1 change. UI-only/derived fields are
// clearly marked. NO SSN is included here (never surfaced in the UI).

export type EmploymentStatus = "active" | "terminated" | "cobra" | "retired" | "leave";
export type Relationship = "spouse" | "child" | "domestic_partner" | "other";

// Mirrors GraphQL `CensusEmployee`.
export type CensusEmployee = {
  employeeId: string;
  employeeNumber: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null; // ISO yyyy-mm-dd
  gender: string | null;
  employmentStatus: EmploymentStatus | null;
  hireDate: string | null;
  terminationDate: string | null;
  employmentClass: string | null;
  eligibilityClass: string | null;
  payType: string | null;
  salary: number | null;
  addressSummary: string | null;
  dependentCount: number;
  eligibilityStatus: boolean | null;
};

// Mirrors GraphQL `EmployerCensusContext`. NOTE: the last three are UI-desired
// health metrics NOT yet in the API (see FRONTEND_DESIGN_PLAN.md gaps).
export type EmployerCensusContext = {
  employerId: string;
  employerName: string;
  planYearLabel: string | null;
  totalEmployees: number;
  activeEmployees: number;
  missingRequiredCount: number;
  // UI-desired (pending API):
  missingEligibilityClassCount: number;
  dependentsMissingDataCount: number;
  needsReviewCount: number;
};

// Mirrors GraphQL `Dependent` (+ UI-derived `age`, placeholder `coveredStatus`).
export type Dependent = {
  dependentId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  gender: string | null;
  relationship: Relationship;
  disabled: boolean | null;
  student: boolean | null;
  // UI-only:
  coveredStatus?: "covered" | "not_covered" | "pending"; // placeholder until enrollment module
};

// Mirrors GraphQL `EmployeeDetail`.
export type EmployeeDetail = CensusEmployee & {
  middleName: string | null;
  altEmail: string | null;
  homePhone: string | null;
  cellPhone: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  originalHireDate: string | null;
  jobTitle: string | null;
  dependents: Dependent[];
};

export const employerCensusContext: EmployerCensusContext = {
  employerId: "acme",
  employerName: "Acme Manufacturing",
  planYearLabel: "2027 Benefits",
  totalEmployees: 6,
  activeEmployees: 4,
  missingRequiredCount: 2,
  missingEligibilityClassCount: 1,
  dependentsMissingDataCount: 1,
  needsReviewCount: 2,
};

export const censusEmployees: CensusEmployee[] = [
  { employeeId: "1", employeeNumber: "EMP-1001", firstName: "Jordan", lastName: "Lee", email: "jordan.lee@acme.com", phone: "(214) 555-0198", dateOfBirth: "1986-05-14", gender: "M", employmentStatus: "active", hireDate: "2022-03-15", terminationDate: null, employmentClass: "Full-Time", eligibilityClass: "Full-Time", payType: "salary", salary: 92000, addressSummary: "Dallas, TX", dependentCount: 2, eligibilityStatus: true },
  { employeeId: "2", employeeNumber: "EMP-1002", firstName: "Maria", lastName: "Patel", email: "maria.patel@acme.com", phone: "(512) 555-0144", dateOfBirth: "1990-11-02", gender: "F", employmentStatus: "active", hireDate: "2021-08-01", terminationDate: null, employmentClass: "Full-Time", eligibilityClass: "Full-Time", payType: "salary", salary: 88000, addressSummary: "Austin, TX", dependentCount: 3, eligibilityStatus: true },
  { employeeId: "3", employeeNumber: "EMP-1003", firstName: "Chris", lastName: "Wong", email: null, phone: "(214) 555-0170", dateOfBirth: "1995-02-20", gender: "M", employmentStatus: "active", hireDate: "2023-01-10", terminationDate: null, employmentClass: "Full-Time", eligibilityClass: null, payType: "hourly", salary: null, addressSummary: "Dallas, TX", dependentCount: 0, eligibilityStatus: true },
  { employeeId: "4", employeeNumber: "EMP-1004", firstName: "Dana", lastName: "Kim", email: "dana.kim@acme.com", phone: "(469) 555-0121", dateOfBirth: "1988-07-30", gender: "F", employmentStatus: "active", hireDate: "2020-05-06", terminationDate: null, employmentClass: "Part-Time", eligibilityClass: "Part-Time Eligible", payType: "hourly", salary: null, addressSummary: "Remote", dependentCount: 1, eligibilityStatus: true },
  { employeeId: "5", employeeNumber: "EMP-1005", firstName: "Luis", lastName: "Garcia", email: "luis.garcia@acme.com", phone: "(210) 555-0188", dateOfBirth: "1979-09-12", gender: "M", employmentStatus: "terminated", hireDate: "2018-02-01", terminationDate: "2026-12-01", employmentClass: "Former Employee", eligibilityClass: null, payType: "hourly", salary: null, addressSummary: "San Antonio, TX", dependentCount: 0, eligibilityStatus: false },
  { employeeId: "6", employeeNumber: "EMP-1006", firstName: "Emily", lastName: "Johnson", email: null, phone: null, dateOfBirth: "1998-04-18", gender: "F", employmentStatus: "active", hireDate: "2026-06-15", terminationDate: null, employmentClass: "Full-Time", eligibilityClass: "Full-Time", payType: "salary", salary: 71000, addressSummary: "Dallas, TX", dependentCount: 1, eligibilityStatus: null },
];

export const employeeDetail: EmployeeDetail = {
  ...censusEmployees[0],
  middleName: null,
  altEmail: null,
  homePhone: null,
  cellPhone: "(214) 555-0198",
  addressLine1: "123 Oak Street",
  city: "Dallas",
  state: "TX",
  zip: "75201",
  originalHireDate: "2022-03-15",
  jobTitle: "Operations Manager",
  dependents: [
    { dependentId: "dep-1", firstName: "Taylor", lastName: "Lee", dateOfBirth: "1987-08-09", gender: "F", relationship: "spouse", disabled: false, student: false, coveredStatus: "covered" },
    { dependentId: "dep-2", firstName: "Avery", lastName: "Lee", dateOfBirth: "2016-02-18", gender: "F", relationship: "child", disabled: false, student: true, coveredStatus: "covered" },
  ],
};

// --- UI helpers (derived display only) --------------------------------------

export const NEW_HIRE_WINDOW_DAYS = 30;

export function ageFromDob(dob: string | null, asOf = new Date()): number | null {
  if (!dob) return null;
  const d = new Date(dob + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return null;
  let age = asOf.getUTCFullYear() - d.getUTCFullYear();
  const m = asOf.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && asOf.getUTCDate() < d.getUTCDate())) age--;
  return age;
}

/** Display label for the API employment status enum (+ derived "New Hire"). */
export function employmentStatusLabel(e: Pick<CensusEmployee, "employmentStatus" | "hireDate">): string {
  if (e.employmentStatus === "terminated") return "Terminated";
  if (e.employmentStatus === "cobra") return "COBRA";
  if (e.employmentStatus === "retired") return "Retired";
  if (e.employmentStatus === "leave") return "On Leave";
  if (e.employmentStatus === "active" && e.hireDate) {
    const hired = new Date(e.hireDate + "T00:00:00Z").getTime();
    if (Date.now() - hired < NEW_HIRE_WINDOW_DAYS * 86400_000) return "New Hire";
  }
  return "Active";
}

/** Lightweight client-side issue derivation (until a server data-quality pass). */
export function employeeIssues(e: CensusEmployee): string[] {
  const issues: string[] = [];
  if (!e.email) issues.push("Missing email");
  if (e.employmentStatus === "active" && !e.eligibilityClass) issues.push("Missing eligibility class");
  if (e.eligibilityStatus === null) issues.push("Eligibility not determined");
  return issues;
}
