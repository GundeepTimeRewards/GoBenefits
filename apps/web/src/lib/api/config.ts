// GraphQL client configuration. Reads from Vite env (VITE_*) at build time, with a
// safe fallback so the module also imports cleanly under bun/node (tests). NOTHING is
// hardcoded — the deployed AppSync URL is supplied via env only.
//
// Mock mode is the DEFAULT: live API is used only when explicitly enabled AND an
// endpoint is configured. Until then every screen keeps using the mock getters.

function readEnv(key: string): string | undefined {
  // Vite injects `import.meta.env.VITE_*`. Guard the access so this file is also
  // importable outside Vite (bun test / node) where import.meta.env may be absent.
  const metaEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  if (metaEnv && metaEnv[key] != null) return metaEnv[key];
  const procEnv = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } })
    .process?.env;
  return procEnv?.[key];
}

/** The AppSync GraphQL endpoint URL, or undefined when unconfigured (mock mode). */
export const GRAPHQL_ENDPOINT: string | undefined = readEnv("VITE_GRAPHQL_ENDPOINT");

/** Explicit opt-in to the live API. Defaults to false → mock mode. */
export const USE_LIVE_API: boolean = readEnv("VITE_USE_LIVE_API") === "true";

/**
 * Whether the app should use the live GraphQL API instead of mock getters. TRUE only
 * when BOTH the opt-in flag is set AND an endpoint is configured — so a missing/typo'd
 * endpoint can never silently break screens; it falls back to mock. This is the single
 * switch future hooks will check when the C2 seam swap happens.
 */
export function isLiveApiEnabled(): boolean {
  return USE_LIVE_API && Boolean(GRAPHQL_ENDPOINT);
}
