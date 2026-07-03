import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useParams } from "@tanstack/react-router";
import { EMPLOYERS, getEmployerProfile, DEFAULT_EMPLOYER_ID, isKnownEmployer } from "@/lib/mock/db";
import { DATA_SOURCE_MODE, isLiveId } from "@/lib/api/dataSource";
import { useEmployers } from "@/lib/api";
import { resolveActiveEmployerId } from "@/lib/active-selection";

// The "active employer" a broker/agency user is working in. Source of truth is
// the URL ($employerId); this context mirrors it so the sidebar/dropdown work on
// non-employer routes too.
//
// C2-FE-4: in hybrid/live mode the id-space is live UUIDs (from `myEmployers`),
// NOT mock slugs. Mock mode is unchanged. The active id is validated against the
// active id-space so mock slugs and live UUIDs can never mix in one render.
const HYBRID = DATA_SOURCE_MODE !== "mock";

const Ctx = createContext<{ selectedEmployerId: string; setSelectedEmployerId: (id: string) => void } | null>(null);

export function EmployerProvider({ children }: { children: ReactNode }) {
  // Mock: the default slug. Hybrid: start empty and initialize from live myEmployers.
  const [selectedEmployerId, setSelectedEmployerId] = useState<string>(HYBRID ? "" : DEFAULT_EMPLOYER_ID);
  const employers = useEmployers();
  useEffect(() => {
    if (!HYBRID) return;
    if (isLiveId(selectedEmployerId)) return; // already a live employer
    const first = employers.data?.[0]?.id;
    if (first && isLiveId(first)) setSelectedEmployerId(first);
  }, [employers.data, selectedEmployerId]);
  return <Ctx.Provider value={{ selectedEmployerId, setSelectedEmployerId }}>{children}</Ctx.Provider>;
}

export function useEmployer() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useEmployer outside EmployerProvider");
  return c;
}

/** Active employer id from the ROUTE ($employerId), falling back to the context/default.
 *  Validated against the ACTIVE id-space (live UUIDs in hybrid, mock slugs otherwise) so a
 *  bad/foreign id can never yield a mixed or all-empty app. In hybrid, a "" result before
 *  the live employer initializes makes downstream C1 hooks fall back to mock safely. */
export function useActiveEmployerId(): string {
  const routeId = useParams({ strict: false }).employerId as string | undefined;
  const { selectedEmployerId } = useEmployer();
  return resolveActiveEmployerId({
    hybrid: HYBRID,
    routeId,
    selectedId: selectedEmployerId,
    isLive: isLiveId,
    isKnownMock: isKnownEmployer,
    mockDefault: DEFAULT_EMPLOYER_ID,
  });
}

/** Mock employer profile for the selected employer (nav/labels). Mock id-space only —
 *  live screens read the employer via the `useEmployer(id)` C1 hook. */
export function useSelectedEmployer() {
  const { selectedEmployerId } = useEmployer();
  return getEmployerProfile(selectedEmployerId);
}

export { EMPLOYERS };
