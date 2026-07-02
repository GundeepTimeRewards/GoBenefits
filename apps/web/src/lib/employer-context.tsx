import { createContext, useContext, useState, type ReactNode } from "react";
import { useParams } from "@tanstack/react-router";
import { EMPLOYERS, getEmployerProfile, DEFAULT_EMPLOYER_ID, isKnownEmployer } from "@/lib/mock/db";

// The "active employer" a broker/agency user is working in. Source of truth is
// the URL ($employerId); this context mirrors it so the sidebar/dropdown work on
// non-employer routes too.
const Ctx = createContext<{ selectedEmployerId: string; setSelectedEmployerId: (id: string) => void } | null>(null);

export function EmployerProvider({ children }: { children: ReactNode }) {
  const [selectedEmployerId, setSelectedEmployerId] = useState(DEFAULT_EMPLOYER_ID);
  return <Ctx.Provider value={{ selectedEmployerId, setSelectedEmployerId }}>{children}</Ctx.Provider>;
}

export function useEmployer() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useEmployer outside EmployerProvider");
  return c;
}

/** Active employer id from the ROUTE ($employerId), falling back to the context/default.
 *  Validated against the known employer list so a bad/undefined id can never yield an
 *  all-empty app (it would otherwise return [] from every keyed getter). */
export function useActiveEmployerId(): string {
  const routeId = useParams({ strict: false }).employerId as string | undefined;
  const { selectedEmployerId } = useEmployer();
  if (isKnownEmployer(routeId)) return routeId!;
  if (isKnownEmployer(selectedEmployerId)) return selectedEmployerId;
  return DEFAULT_EMPLOYER_ID;
}

export function useSelectedEmployer() {
  const { selectedEmployerId } = useEmployer();
  return getEmployerProfile(selectedEmployerId);
}

export { EMPLOYERS };
