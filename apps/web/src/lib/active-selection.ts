// Pure resolution of the active employer + plan-year ids in the correct id-space
// (live UUIDs in hybrid, mock slugs otherwise). Extracted from the context hooks so the
// selection logic is unit-testable without a React/router harness. See employer-context /
// plan-year-context for the hooks that feed these.

export function resolveActiveEmployerId(p: {
  hybrid: boolean;
  routeId: string | undefined;
  selectedId: string;
  isLive: (id: string | null | undefined) => boolean;
  isKnownMock: (id: string | undefined) => boolean;
  mockDefault: string;
}): string {
  if (p.hybrid) {
    if (p.isLive(p.routeId)) return p.routeId!;
    if (p.isLive(p.selectedId)) return p.selectedId;
    return p.selectedId; // "" until live myEmployers initializes → callers fall back to mock
  }
  if (p.isKnownMock(p.routeId)) return p.routeId!;
  if (p.isKnownMock(p.selectedId)) return p.selectedId;
  return p.mockDefault;
}

export function resolveActivePlanYearId(p: {
  hybrid: boolean;
  employerIsLive: boolean;
  routeId: string | undefined;
  selectedId: string | null;
  liveIds: string[];
  liveCurrentId: string | undefined;
  liveFirstId: string | undefined;
  mockYearIds: string[];
  mockCurrentId: string;
}): string {
  if (p.hybrid && p.employerIsLive) {
    const ids = new Set(p.liveIds);
    if (p.routeId && ids.has(p.routeId)) return p.routeId;
    if (p.selectedId && ids.has(p.selectedId)) return p.selectedId;
    return p.liveCurrentId ?? p.liveFirstId ?? ""; // no plan year → ""
  }
  const ids = new Set(p.mockYearIds);
  if (p.routeId && ids.has(p.routeId)) return p.routeId;
  if (p.selectedId && ids.has(p.selectedId)) return p.selectedId;
  return p.mockCurrentId;
}
