// Active employer/plan-year selection tests (pure — no React/router harness).
import { test, expect, describe } from "bun:test";
import { resolveActiveEmployerId, resolveActivePlanYearId } from "./active-selection";

const LIVE_A = "eeee0000-0000-0000-0000-0000000000a1";
const LIVE_B = "eeee0000-0000-0000-0000-0000000000b2";
const isLive = (id: string | null | undefined) => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id);
const isKnownMock = (id: string | undefined) => id === "acme" || id === "harbor";

describe("resolveActiveEmployerId", () => {
  test("mock mode: route mock id > selected mock id > default; ignores UUIDs", () => {
    expect(resolveActiveEmployerId({ hybrid: false, routeId: "harbor", selectedId: "acme", isLive, isKnownMock, mockDefault: "acme" })).toBe("harbor");
    expect(resolveActiveEmployerId({ hybrid: false, routeId: undefined, selectedId: "harbor", isLive, isKnownMock, mockDefault: "acme" })).toBe("harbor");
    expect(resolveActiveEmployerId({ hybrid: false, routeId: LIVE_A, selectedId: "acme", isLive, isKnownMock, mockDefault: "acme" })).toBe("acme"); // UUID not a known mock
    expect(resolveActiveEmployerId({ hybrid: false, routeId: "unknown", selectedId: "nope", isLive, isKnownMock, mockDefault: "acme" })).toBe("acme");
  });

  test("hybrid mode: route UUID > selected UUID > selected (may be empty); ignores mock slugs", () => {
    expect(resolveActiveEmployerId({ hybrid: true, routeId: LIVE_B, selectedId: LIVE_A, isLive, isKnownMock, mockDefault: "acme" })).toBe(LIVE_B);
    expect(resolveActiveEmployerId({ hybrid: true, routeId: undefined, selectedId: LIVE_A, isLive, isKnownMock, mockDefault: "acme" })).toBe(LIVE_A);
    // a mock slug in the route is NOT accepted in hybrid (no id-space mixing):
    expect(resolveActiveEmployerId({ hybrid: true, routeId: "acme", selectedId: LIVE_A, isLive, isKnownMock, mockDefault: "acme" })).toBe(LIVE_A);
    // before live init, selected is "" (safe empty → callers fall back to mock)
    expect(resolveActiveEmployerId({ hybrid: true, routeId: undefined, selectedId: "", isLive, isKnownMock, mockDefault: "acme" })).toBe("");
    // never returns the mock default in hybrid
    expect(resolveActiveEmployerId({ hybrid: true, routeId: "acme", selectedId: "", isLive, isKnownMock, mockDefault: "acme" })).toBe("");
  });
});

describe("resolveActivePlanYearId", () => {
  const base = { routeId: undefined as string | undefined, selectedId: null as string | null };

  test("mock mode: route > selected > current (from mock ids)", () => {
    expect(resolveActivePlanYearId({ ...base, hybrid: false, employerIsLive: false, routeId: "2026", liveIds: [], liveCurrentId: undefined, liveFirstId: undefined, mockYearIds: ["2027", "2026"], mockCurrentId: "2027" })).toBe("2026");
    expect(resolveActivePlanYearId({ ...base, hybrid: false, employerIsLive: false, selectedId: "2026", liveIds: [], liveCurrentId: undefined, liveFirstId: undefined, mockYearIds: ["2027", "2026"], mockCurrentId: "2027" })).toBe("2026");
    expect(resolveActivePlanYearId({ ...base, hybrid: false, employerIsLive: false, liveIds: [], liveCurrentId: undefined, liveFirstId: undefined, mockYearIds: ["2027", "2026"], mockCurrentId: "2027" })).toBe("2027");
  });

  test("hybrid + live employer: initializes from live current plan year", () => {
    const PY = "a2220000-0000-0000-0000-000000000002";
    expect(resolveActivePlanYearId({ ...base, hybrid: true, employerIsLive: true, liveIds: [PY], liveCurrentId: PY, liveFirstId: PY, mockYearIds: ["2027"], mockCurrentId: "2027" })).toBe(PY);
  });

  test("hybrid + live employer: route/selected honored only if a known live id", () => {
    const PY1 = "a2220000-0000-0000-0000-000000000001";
    const PY2 = "a2220000-0000-0000-0000-000000000002";
    expect(resolveActivePlanYearId({ hybrid: true, employerIsLive: true, routeId: PY1, selectedId: null, liveIds: [PY1, PY2], liveCurrentId: PY2, liveFirstId: PY1, mockYearIds: [], mockCurrentId: "" })).toBe(PY1);
    // a stale mock/foreign id is ignored → falls to live current
    expect(resolveActivePlanYearId({ hybrid: true, employerIsLive: true, routeId: "2027", selectedId: null, liveIds: [PY1, PY2], liveCurrentId: PY2, liveFirstId: PY1, mockYearIds: [], mockCurrentId: "" })).toBe(PY2);
  });

  test("hybrid + live employer with NO plan year → empty string (graceful)", () => {
    expect(resolveActivePlanYearId({ ...base, hybrid: true, employerIsLive: true, liveIds: [], liveCurrentId: undefined, liveFirstId: undefined, mockYearIds: [], mockCurrentId: "" })).toBe("");
  });

  test("hybrid but employer not yet live → uses mock path (no mixing)", () => {
    expect(resolveActivePlanYearId({ ...base, hybrid: true, employerIsLive: false, liveIds: ["uuid"], liveCurrentId: "uuid", liveFirstId: "uuid", mockYearIds: ["2027"], mockCurrentId: "2027" })).toBe("2027");
  });
});
