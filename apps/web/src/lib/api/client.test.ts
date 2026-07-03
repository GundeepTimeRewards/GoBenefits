// GraphQL client tests (pure — no network, no deployed endpoint). Uses an injected
// fetch so we control the response shapes.
import { test, expect, describe } from "bun:test";
import { createGraphQLClient, GraphQLClientError } from "./client";

const ENDPOINT = "https://example.test/graphql";

/** Build a fake fetch that returns a given JSON body (HTTP 200 unless overridden). */
function fakeFetch(body: unknown, init?: { status?: number; captured?: any[] }): typeof fetch {
  return (async (url: string, req: RequestInit) => {
    init?.captured?.push({ url, req });
    return {
      ok: (init?.status ?? 200) >= 200 && (init?.status ?? 200) < 300,
      status: init?.status ?? 200,
      json: async () => body,
    } as Response;
  }) as unknown as typeof fetch;
}

describe("createGraphQLClient — success", () => {
  test("returns data on a successful response", async () => {
    const client = createGraphQLClient({ endpoint: ENDPOINT, fetchImpl: fakeFetch({ data: { me: { userId: "u1", role: "employer_admin" } } }) });
    const data = await client.request<{ me: { userId: string; role: string } }>("query { me { userId role } }");
    expect(data.me.userId).toBe("u1");
    expect(data.me.role).toBe("employer_admin");
    expect(client.configured).toBe(true);
  });

  test("sends the Authorization header from the token provider + JSON body", async () => {
    const captured: any[] = [];
    const client = createGraphQLClient({
      endpoint: ENDPOINT,
      getAuthToken: () => "id-token-abc",
      fetchImpl: fakeFetch({ data: { ok: true } }, { captured }),
    });
    await client.request("query Q($x: ID!) { f(x: $x) }", { x: "e1" });
    expect(captured).toHaveLength(1);
    expect(captured[0].url).toBe(ENDPOINT);
    expect(captured[0].req.headers.Authorization).toBe("id-token-abc");
    const parsed = JSON.parse(captured[0].req.body);
    expect(parsed.query).toContain("f(x: $x)");
    expect(parsed.variables).toEqual({ x: "e1" });
  });

  test("omits Authorization when no token provider is set", async () => {
    const captured: any[] = [];
    const client = createGraphQLClient({ endpoint: ENDPOINT, fetchImpl: fakeFetch({ data: {} }, { captured }) });
    await client.request("query { me { userId } }");
    expect(captured[0].req.headers.Authorization).toBeUndefined();
  });
});

describe("createGraphQLClient — typed error mapping", () => {
  test("Unauthorized errorType → GraphQLClientError type 'Unauthorized'", async () => {
    const client = createGraphQLClient({ endpoint: ENDPOINT, fetchImpl: fakeFetch({ errors: [{ errorType: "Unauthorized", message: "Not authorized for this employer" }] }) });
    try {
      await client.request("query { employees { items { employeeId } } }");
      throw new Error("expected rejection");
    } catch (e) {
      expect(e).toBeInstanceOf(GraphQLClientError);
      expect((e as GraphQLClientError).type).toBe("Unauthorized");
      expect((e as GraphQLClientError).message).toContain("Not authorized");
    }
  });

  test("ValidationError errorType → GraphQLClientError type 'ValidationError'", async () => {
    const client = createGraphQLClient({ endpoint: ENDPOINT, fetchImpl: fakeFetch({ errors: [{ errorType: "ValidationError", message: "Last name is required" }] }) });
    await expect(client.request("mutation { createEmployee(input: {}) { employeeId } }")).rejects.toMatchObject({
      type: "ValidationError",
    });
  });

  test("other GraphQL errors → type 'GraphQL'", async () => {
    const client = createGraphQLClient({ endpoint: ENDPOINT, fetchImpl: fakeFetch({ errors: [{ message: "boom" }] }) });
    await expect(client.request("query { x }")).rejects.toMatchObject({ type: "GraphQL" });
  });

  test("network failure → type 'Network'", async () => {
    const client = createGraphQLClient({
      endpoint: ENDPOINT,
      fetchImpl: (async () => {
        throw new Error("ECONNREFUSED");
      }) as unknown as typeof fetch,
    });
    await expect(client.request("query { x }")).rejects.toMatchObject({ type: "Network" });
  });
});

describe("createGraphQLClient — mock-safe when unconfigured", () => {
  test("no endpoint → configured=false and request throws NotConfigured (never hits network)", async () => {
    let fetchCalled = false;
    const client = createGraphQLClient({
      endpoint: undefined,
      fetchImpl: (async () => {
        fetchCalled = true;
        return {} as Response;
      }) as unknown as typeof fetch,
    });
    expect(client.configured).toBe(false);
    await expect(client.request("query { me { userId } }")).rejects.toMatchObject({ type: "NotConfigured" });
    expect(fetchCalled).toBe(false);
  });
});
