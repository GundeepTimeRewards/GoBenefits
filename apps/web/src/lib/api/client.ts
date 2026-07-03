// Minimal GraphQL-over-HTTP client for AppSync (Cognito user-pool auth). This is
// GROUNDWORK: no screen calls it yet (mock mode is default). When the C2 seam swap
// happens, hooks call these operations instead of the mock getters.
//
// Design goals (see task C2-FE-FOUNDATION-1):
//  - configurable endpoint (never hardcoded) + configurable auth-token provider
//  - a typed request helper
//  - typed error mapping: Unauthorized / ValidationError / generic GraphQL / network
//  - safe when no endpoint is configured (throws a clear NotConfigured error rather
//    than making a request), so mock mode can never accidentally hit the network.
import { GRAPHQL_ENDPOINT } from "./config";

export type GraphQLErrorType =
  | "Unauthorized"
  | "ValidationError"
  | "GraphQL" // any other GraphQL `errors[]` entry
  | "Network" // transport / non-JSON / non-2xx
  | "NotConfigured"; // no endpoint set (mock mode)

/** Normalized client error. `type` mirrors the backend's `errorType` where present. */
export class GraphQLClientError extends Error {
  readonly type: GraphQLErrorType;
  readonly errors?: unknown;
  constructor(type: GraphQLErrorType, message: string, errors?: unknown) {
    super(message);
    this.name = "GraphQLClientError";
    this.type = type;
    this.errors = errors;
  }
}

/** Returns the Authorization header value (a Cognito ID token) or null/undefined. */
export type AuthTokenProvider = () => string | null | undefined | Promise<string | null | undefined>;

export type GraphQLClientOptions = {
  /** Overrides the env endpoint. Undefined → falls back to VITE_GRAPHQL_ENDPOINT. */
  endpoint?: string;
  /** Supplies the Cognito ID token per request. Omitted → no Authorization header. */
  getAuthToken?: AuthTokenProvider;
  /** Injectable fetch (tests). Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
};

export type GraphQLClient = {
  request<TData = unknown, TVars extends Record<string, unknown> = Record<string, unknown>>(
    document: string,
    variables?: TVars
  ): Promise<TData>;
  /** True when an endpoint is configured (i.e. requests can be attempted). */
  readonly configured: boolean;
};

function mapErrorType(errorType: unknown): GraphQLErrorType {
  if (errorType === "Unauthorized") return "Unauthorized";
  if (errorType === "ValidationError") return "ValidationError";
  return "GraphQL";
}

/** Create a GraphQL client. Pure/injectable — tests pass an explicit endpoint + fetch. */
export function createGraphQLClient(options: GraphQLClientOptions = {}): GraphQLClient {
  const endpoint = options.endpoint ?? GRAPHQL_ENDPOINT;
  const getAuthToken = options.getAuthToken;
  const doFetch = options.fetchImpl ?? ((globalThis as unknown as { fetch: typeof fetch }).fetch);

  return {
    get configured() {
      return Boolean(endpoint);
    },
    async request<TData, TVars extends Record<string, unknown>>(document: string, variables?: TVars): Promise<TData> {
      if (!endpoint) {
        throw new GraphQLClientError(
          "NotConfigured",
          "GraphQL endpoint is not configured; the app is in mock mode. Set VITE_GRAPHQL_ENDPOINT and VITE_USE_LIVE_API=true to enable the live API."
        );
      }

      const token = getAuthToken ? await getAuthToken() : null;

      let res: Response;
      try {
        res = await doFetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: token } : {}),
          },
          body: JSON.stringify({ query: document, variables: variables ?? {} }),
        });
      } catch (e) {
        throw new GraphQLClientError("Network", `Network error contacting GraphQL endpoint: ${(e as Error).message}`, e);
      }

      let payload: { data?: TData; errors?: Array<{ message?: string; errorType?: string }> };
      try {
        payload = (await res.json()) as typeof payload;
      } catch (e) {
        throw new GraphQLClientError("Network", `Invalid JSON from GraphQL endpoint (HTTP ${res.status}).`, e);
      }

      // GraphQL errors are reported in `errors[]` even on HTTP 200. Map the first one's
      // errorType to our typed error so callers can branch on Unauthorized/ValidationError.
      if (payload && Array.isArray(payload.errors) && payload.errors.length > 0) {
        const first = payload.errors[0];
        throw new GraphQLClientError(mapErrorType(first?.errorType), first?.message ?? "GraphQL error", payload.errors);
      }

      if (!res.ok) {
        throw new GraphQLClientError("Network", `GraphQL endpoint returned HTTP ${res.status}.`, payload);
      }

      return payload.data as TData;
    },
  };
}

// --- Default singleton (env-configured) --------------------------------------
// Safe when unconfigured: `request` throws NotConfigured rather than hitting the
// network, so importing this never breaks mock-mode screens.
let authTokenProvider: AuthTokenProvider = () => null;

/** Register how the app obtains the Cognito ID token (wired when auth lands). */
export function setAuthTokenProvider(provider: AuthTokenProvider): void {
  authTokenProvider = provider;
}

export const graphqlClient: GraphQLClient = createGraphQLClient({
  getAuthToken: () => authTokenProvider(),
});
