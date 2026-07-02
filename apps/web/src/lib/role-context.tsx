import { createContext, useContext, useState, type ReactNode } from "react";

// MOCK role switcher for review only — NOT auth. Real role/scope comes from
// Cognito + backend later; this just filters the mock UI so we can *see* each
// persona in the Agency → Broker → Employer → Employee hierarchy.
export type Role = "platform_admin" | "agency_admin" | "broker" | "employer_admin" | "employee";

export const roleLabels: Record<Role, string> = {
  platform_admin: "Platform Admin",
  agency_admin: "Agency Admin",
  broker: "Broker / Producer",
  employer_admin: "Employer Admin (HR)",
  employee: "Employee",
};

export const ROLES: Role[] = ["platform_admin", "agency_admin", "broker", "employer_admin", "employee"];

const Ctx = createContext<{ role: Role; setRole: (r: Role) => void } | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>("platform_admin");
  return <Ctx.Provider value={{ role, setRole }}>{children}</Ctx.Provider>;
}

export function useRole() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useRole outside RoleProvider");
  return c;
}
