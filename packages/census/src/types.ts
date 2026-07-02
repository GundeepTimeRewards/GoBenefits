export const EMPLOYMENT_STATUSES = ["active", "terminated", "cobra", "retired", "leave"] as const;
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];

/** Practical census row for the UI (lean — see MODULE_CENSUS_PLAN.md). */
export type CensusEmployee = {
  employeeId: string;
  employeeNumber: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  employmentStatus: string | null;
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

export type EmployerCensusContext = {
  employerId: string;
  employerName: string;
  planYearId: string | null;
  planYearLabel: string | null;
  totalEmployees: number;
  activeEmployees: number;
  missingRequiredCount: number;
  missingEligibilityClassCount: number;
  dependentsMissingDataCount: number;
  needsReviewCount: number;
};

export type CreateEmployeeInput = {
  employerId: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  employmentStatus?: string | null;
  hireDate?: string | null;
  terminationDate?: string | null;
  employeeClass?: string | null;
  eligibilityClassId?: string | null;
  payType?: string | null;
  salary?: number | null;
  employeeNumber?: string | null;
};

export type UpdateEmployeeInput = CreateEmployeeInput & { employeeId: string };
