// Live identity / role-aware nav tests (pure — no React harness).
import { test, expect, describe } from "bun:test";
import { mapMeRoleToPersonaRole, resolveEffectiveRole, pickEmployerProfile } from "./live-identity";
import { getPersonaNav, NAV_ITEMS, itemKey, personaNav } from "./persona";
import { DATA_SOURCE_MODE } from "@/lib/api/dataSource";

describe("mapMeRoleToPersonaRole (GraphQL Role → persona role)", () => {
  test("maps every backend role", () => {
    expect(mapMeRoleToPersonaRole("super_admin")).toBe("platform_admin");
    expect(mapMeRoleToPersonaRole("support")).toBe("platform_admin"); // nav-only
    expect(mapMeRoleToPersonaRole("agency_admin")).toBe("agency_admin");
    expect(mapMeRoleToPersonaRole("broker")).toBe("broker");
    expect(mapMeRoleToPersonaRole("employer_admin")).toBe("employer_admin");
    expect(mapMeRoleToPersonaRole("employee")).toBe("employee");
  });

  test("unsupported/missing roles fail safe to employer_admin", () => {
    expect(mapMeRoleToPersonaRole("root")).toBe("employer_admin");
    expect(mapMeRoleToPersonaRole("")).toBe("employer_admin");
    expect(mapMeRoleToPersonaRole(null)).toBe("employer_admin");
    expect(mapMeRoleToPersonaRole(undefined)).toBe("employer_admin");
  });
});

describe("resolveEffectiveRole", () => {
  test("mock mode: switcher role unchanged, source=mock", () => {
    const r = resolveEffectiveRole("mock", "broker", undefined, false);
    expect(r).toMatchObject({ role: "broker", source: "mock", loading: false });
  });

  test("hybrid-fallback (no endpoint): switcher role stays in charge", () => {
    const r = resolveEffectiveRole("fallback", "agency_admin", undefined, false);
    expect(r).toMatchObject({ role: "agency_admin", source: "mock" });
  });

  test("live + me loaded: role comes from me.role", () => {
    expect(resolveEffectiveRole("live", "platform_admin", "broker", true))
      .toMatchObject({ role: "broker", source: "live", loading: false });
    expect(resolveEffectiveRole("live", "broker", "super_admin", true).role).toBe("platform_admin");
  });

  test("live + me not loaded/errored: fail-safe employer_admin, loading", () => {
    expect(resolveEffectiveRole("live", "platform_admin", undefined, false))
      .toMatchObject({ role: "employer_admin", source: "live", loading: true });
  });

  test("live + unsupported me.role: fail-safe employer_admin", () => {
    expect(resolveEffectiveRole("live", "platform_admin", "cobra_admin", true).role).toBe("employer_admin");
  });
});

describe("nav by role", () => {
  test("each mapped live role resolves to a persona nav", () => {
    for (const meRole of ["super_admin", "support", "agency_admin", "broker", "employer_admin"]) {
      const nav = getPersonaNav(mapMeRoleToPersonaRole(meRole));
      expect(nav.groups.length).toBeGreaterThan(0);
    }
  });

  test("employee live role falls back to the restricted employer_admin nav (no self-service nav)", () => {
    const nav = getPersonaNav(mapMeRoleToPersonaRole("employee"));
    expect(nav).toBe(personaNav.employer_admin);
  });

  test("no persona nav item routes into employee self-service", () => {
    for (const nav of Object.values(personaNav)) {
      for (const g of nav.groups) {
        for (const it of g.items) {
          expect(NAV_ITEMS[itemKey(it)].to.startsWith("/employee")).toBe(false);
        }
      }
    }
  });
});

describe("selected employer label preference", () => {
  test("uses the live employer profile when available, mock otherwise", () => {
    const live = { id: "uuid", name: "Employer A (live)" };
    const mock = { id: "acme", name: "Acme Manufacturing" };
    expect(pickEmployerProfile(live, mock)).toBe(live);
    expect(pickEmployerProfile(undefined, mock)).toBe(mock);
  });
});

describe("default mode", () => {
  test("mock mode remains the default (role switcher stays interactive)", () => {
    expect(DATA_SOURCE_MODE).toBe("mock");
  });
});
