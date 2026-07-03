// Data-source mode: decides per-hook whether to read live (local GraphQL / AppSync) or
// mock. DEFAULT is mock. Live only for C1-capable hooks, only when the endpoint+auth are
// configured, and only for live-shaped (UUID) employer ids — so a screen can never mix a
// mock slug employer with a live UUID employer in the same render.
import { GRAPHQL_ENDPOINT, USE_LIVE_API, isLiveApiEnabled } from "./config";
import { setAuthTokenProvider } from "./client";

export type DataSourceMode = "mock" | "hybrid" | "api";

function readEnv(key: string): string | undefined {
  const metaEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  if (metaEnv && metaEnv[key] != null) return metaEnv[key];
  return (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[key];
}

/** VITE_DATA_SOURCE = mock | hybrid | api (default mock). `api` behaves like `hybrid`
 *  today because Phase D–F resolvers don't exist yet. */
export const DATA_SOURCE_MODE: DataSourceMode = ((): DataSourceMode => {
  const v = readEnv("VITE_DATA_SOURCE");
  return v === "hybrid" || v === "api" ? v : "mock";
})();

/** Dev-only seeded cognito_sub for the local endpoint (VITE_DEV_AUTH_SUB). */
export const DEV_AUTH_SUB: string | undefined = readEnv("VITE_DEV_AUTH_SUB");

/** The operations whose backend resolver exists in C1 and may go live (reads + the C1
 *  mutations). Everything else is mock-only until its Phase D–F backend lands. */
export const C1_LIVE_CAPABLE = new Set<string>([
  // reads
  "me",
  "myEmployers",
  "employer",
  "planYears",
  "currentPlanYear",
  "employees",
  "employerCensusContext",
  "employeeDetail",
  "dependents",
  // mutations
  "createEmployee",
  "updateEmployee",
  "addDependent",
  "updateDependent",
  "removeDependent",
]);

export type DataSourceResolution = "mock" | "live" | "fallback";

/** True for a live-shaped (UUID) id. Live employer/plan-year ids are UUIDs; mock ids are
 *  slugs ("acme") / years ("2027"). Used to prevent id-space mixing. */
export function isLiveId(id: string | null | undefined): boolean {
  return typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

const warned = new Set<string>();
function devWarnOnce(key: string, message: string): void {
  const isDev = Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV);
  if (!isDev || warned.has(key)) return;
  warned.add(key);
  // eslint-disable-next-line no-console
  console.warn(`[data-source] ${message}`);
}

/**
 * PURE decision (no module state, no side effects) — fully unit-testable.
 *  - "mock"     — mock mode, or a non-C1 hook, or (for employer-scoped reads) a non-live id.
 *  - "live"     — hybrid/api + C1-capable + endpoint/auth enabled (+ live id if required).
 *  - "fallback" — hybrid wanted live but endpoint/auth is missing → uses mock, flagged.
 */
export function decideDataSource(
  mode: DataSourceMode,
  liveEnabled: boolean,
  hookKey: string,
  requiredLiveId?: string | null
): DataSourceResolution {
  if (mode === "mock") return "mock";
  if (!C1_LIVE_CAPABLE.has(hookKey)) return "mock"; // non-C1 hooks are always mock for now
  if (!liveEnabled) return "fallback"; // hybrid requested but endpoint/auth missing
  if (requiredLiveId !== undefined && !isLiveId(requiredLiveId)) return "mock"; // avoid id-space mixing
  return "live";
}

/**
 * Resolve the source for a hook using the app's env config. NOT a React hook (safe in
 * queryFns). Emits a one-time dev warning on fallback / id-space mismatch.
 * `requiredLiveId` (optional): the employer id the hook scopes by — if not a live UUID we
 * stay on mock to avoid mixing id-spaces.
 */
export function resolveDataSource(hookKey: string, requiredLiveId?: string | null): DataSourceResolution {
  const decision = decideDataSource(DATA_SOURCE_MODE, isLiveApiEnabled(), hookKey, requiredLiveId);
  if (decision === "fallback") {
    devWarnOnce(
      `cfg:${hookKey}`,
      `hybrid mode requested but the live API is not configured (VITE_GRAPHQL_ENDPOINT / VITE_USE_LIVE_API); '${hookKey}' falls back to mock.`
    );
  } else if (decision === "mock" && DATA_SOURCE_MODE !== "mock" && C1_LIVE_CAPABLE.has(hookKey) && requiredLiveId !== undefined && !isLiveId(requiredLiveId)) {
    devWarnOnce(
      `id:${hookKey}`,
      `'${hookKey}' has a non-live (mock) employer id '${requiredLiveId}'; staying on mock to avoid id-space mixing. Select a live employer to read live.`
    );
  }
  return decision;
}

/** React-friendly alias (currently identical; kept for the documented API surface). */
export function useDataSource(hookKey: string, requiredLiveId?: string | null): DataSourceResolution {
  return resolveDataSource(hookKey, requiredLiveId);
}

// --- Dev auth wiring ---------------------------------------------------------
// In hybrid/api mode, send the dev sub as the Authorization value; the local dev server
// (local/dev-graphql.ts) maps it to event.identity.sub. Harmless in prod: only set when a
// dev sub is configured, and AppSync would use a real token provider instead.
if (DATA_SOURCE_MODE !== "mock" && DEV_AUTH_SUB) {
  setAuthTokenProvider(() => DEV_AUTH_SUB);
}

// --- Diagnostics (dev-only) --------------------------------------------------
export type DataSourceDiagnostics = {
  mode: DataSourceMode;
  endpointConfigured: boolean;
  liveApiEnabled: boolean;
  devAuthSubConfigured: boolean;
  c1LiveCapable: string[];
};

export function getDataSourceDiagnostics(): DataSourceDiagnostics {
  return {
    mode: DATA_SOURCE_MODE,
    endpointConfigured: Boolean(GRAPHQL_ENDPOINT),
    liveApiEnabled: isLiveApiEnabled(),
    devAuthSubConfigured: Boolean(DEV_AUTH_SUB),
    c1LiveCapable: [...C1_LIVE_CAPABLE],
  };
}

/** Overall UI badge state for the dev indicator. */
export function dataSourceBadgeState(): "mock" | "hybrid-live" | "hybrid-fallback" {
  if (DATA_SOURCE_MODE === "mock") return "mock";
  return isLiveApiEnabled() ? "hybrid-live" : "hybrid-fallback";
}

// Log a one-time diagnostic in dev when not in plain mock mode.
{
  const isDev = Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV);
  if (isDev && DATA_SOURCE_MODE !== "mock" && !USE_LIVE_API) {
    // eslint-disable-next-line no-console
    console.info("[data-source] mode=%s but VITE_USE_LIVE_API!=true → all hooks fall back to mock.", DATA_SOURCE_MODE);
  }
}
