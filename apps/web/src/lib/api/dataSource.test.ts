// Data-source decision tests (pure function → all modes/combos without env juggling).
import { test, expect, describe } from "bun:test";
import { decideDataSource, isLiveId, DATA_SOURCE_MODE, resolveDataSource } from "./dataSource";

const LIVE_ID = "eeee0000-0000-0000-0000-0000000000a1";
const MOCK_ID = "acme";

describe("isLiveId", () => {
  test("true for UUIDs, false for slugs/years/empty", () => {
    expect(isLiveId(LIVE_ID)).toBe(true);
    expect(isLiveId("acme")).toBe(false);
    expect(isLiveId("2027")).toBe(false);
    expect(isLiveId("")).toBe(false);
    expect(isLiveId(null)).toBe(false);
    expect(isLiveId(undefined)).toBe(false);
  });
});

describe("decideDataSource", () => {
  test("mock mode → always mock", () => {
    expect(decideDataSource("mock", true, "employees", LIVE_ID)).toBe("mock");
    expect(decideDataSource("mock", true, "me")).toBe("mock");
  });

  test("hybrid + non-C1 hook → mock", () => {
    expect(decideDataSource("hybrid", true, "payrollWorkspace", LIVE_ID)).toBe("mock");
    expect(decideDataSource("hybrid", true, "employerOverview", LIVE_ID)).toBe("mock");
  });

  test("hybrid + C1 hook + live api enabled → live (no id required)", () => {
    expect(decideDataSource("hybrid", true, "me")).toBe("live");
    expect(decideDataSource("hybrid", true, "myEmployers")).toBe("live");
  });

  test("hybrid + C1 hook + live api DISABLED → fallback", () => {
    expect(decideDataSource("hybrid", false, "employees", LIVE_ID)).toBe("fallback");
    expect(decideDataSource("hybrid", false, "me")).toBe("fallback");
  });

  test("hybrid + C1 employer-scoped hook + MOCK id → mock (no id-space mixing)", () => {
    expect(decideDataSource("hybrid", true, "employees", MOCK_ID)).toBe("mock");
    expect(decideDataSource("hybrid", true, "employer", MOCK_ID)).toBe("mock");
  });

  test("hybrid + C1 employer-scoped hook + LIVE id → live", () => {
    expect(decideDataSource("hybrid", true, "employees", LIVE_ID)).toBe("live");
    expect(decideDataSource("api", true, "employer", LIVE_ID)).toBe("live"); // api behaves like hybrid
  });

  test("C1 mutations are gated the same way (mock / fallback / live)", () => {
    for (const op of ["createEmployee", "updateEmployee", "addDependent", "updateDependent", "removeDependent"]) {
      expect(decideDataSource("mock", true, op, LIVE_ID)).toBe("mock");
      expect(decideDataSource("hybrid", false, op, LIVE_ID)).toBe("fallback"); // live api off
      expect(decideDataSource("hybrid", true, op, MOCK_ID)).toBe("mock"); // non-live employer id
      expect(decideDataSource("hybrid", true, op, LIVE_ID)).toBe("live");
    }
  });
});

describe("resolveDataSource (env-bound default)", () => {
  test("default local mode is mock", () => {
    expect(DATA_SOURCE_MODE).toBe("mock");
    expect(resolveDataSource("employees", LIVE_ID)).toBe("mock");
    expect(resolveDataSource("me")).toBe("mock");
  });
});
