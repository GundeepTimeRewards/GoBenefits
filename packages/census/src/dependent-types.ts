export const RELATIONSHIPS = ["spouse", "child", "domestic_partner", "other"] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];

export type Dependent = {
  dependentId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  gender: string | null;
  relationship: string;
  disabled: boolean | null;
  student: boolean | null;
};

export type CreateDependentInput = {
  employerId: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string | null;
  gender?: string | null;
  relationship: string;
  disabled?: boolean | null;
  student?: boolean | null;
};

export type UpdateDependentInput = Omit<CreateDependentInput, "employeeId"> & {
  employeeId?: string;
  dependentId: string;
};

/** Fuller employee record for the detail screen (personal + employment + contact + address). */
export type EmployeeDetail = {
  employeeId: string;
  employeeNumber: string | null;
  firstName: string;
  middleName: string | null;
  lastName: string;
  dateOfBirth: string | null;
  gender: string | null;
  email: string | null;
  altEmail: string | null;
  homePhone: string | null;
  cellPhone: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  employmentStatus: string | null;
  hireDate: string | null;
  originalHireDate: string | null;
  terminationDate: string | null;
  jobTitle: string | null;
  employmentClass: string | null;
  eligibilityClass: string | null;
  payType: string | null;
  salary: number | null;
  dependents: Dependent[];
};
