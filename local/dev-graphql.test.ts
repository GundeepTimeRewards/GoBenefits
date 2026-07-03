// Local GraphQL dev endpoint tests. Uses a FAKE handler (no MySQL) to prove the schema
// dispatches each field to the resolver handler with { info.fieldName, arguments,
// identity.sub }, and that the dev auth sub reaches identity.sub via headers.
import { test, expect, describe } from "bun:test";
import { graphql } from "graphql";
import { createDevSchema, subFromHeaders, type ResolverHandler } from "./dev-graphql";

describe("subFromHeaders (dev auth shim)", () => {
  test("prefers x-dev-auth-sub", () => {
    const h = new Headers({ "x-dev-auth-sub": "sub-broker-a", authorization: "Bearer other" });
    expect(subFromHeaders(h)).toBe("sub-broker-a");
  });
  test("falls back to Authorization (strips Bearer)", () => {
    expect(subFromHeaders(new Headers({ authorization: "Bearer sub-emp-admin-a" }))).toBe("sub-emp-admin-a");
    expect(subFromHeaders(new Headers({ authorization: "sub-agency" }))).toBe("sub-agency");
  });
  test("undefined when no header (and no env)", () => {
    expect(subFromHeaders(new Headers({}))).toBeUndefined();
  });
});

describe("createDevSchema dispatch", () => {
  test("dispatches a query field to the handler with fieldName/args + identity.sub", async () => {
    const calls: any[] = [];
    const fake: ResolverHandler = async (event) => {
      calls.push(event);
      // shape matching the employees connection selection
      return { items: [{ employeeId: "e-1", lastName: "Tester" }], nextToken: null };
    };
    const schema = createDevSchema(fake);
    const result = await graphql({
      schema,
      source: `query($e: ID!, $py: ID!){ employees(employerId: $e, planYearId: $py) { items { employeeId lastName } nextToken } }`,
      variableValues: { e: "emp-uuid", py: "py-uuid" },
      contextValue: { devSub: "sub-emp-admin-a" },
    });
    expect(result.errors).toBeUndefined();
    expect((result.data as any).employees.items[0].employeeId).toBe("e-1");
    expect(calls).toHaveLength(1);
    expect(calls[0].info.fieldName).toBe("employees");
    expect(calls[0].info.parentTypeName).toBe("Query");
    // args include the caller's vars (+ the schema default `limit: 50`).
    expect(calls[0].arguments).toMatchObject({ employerId: "emp-uuid", planYearId: "py-uuid" });
    expect(calls[0].identity.sub).toBe("sub-emp-admin-a"); // dev sub reached identity.sub
  });

  test("dispatches a mutation field too", async () => {
    const calls: any[] = [];
    const fake: ResolverHandler = async (event) => {
      calls.push(event);
      return { removed: true };
    };
    const schema = createDevSchema(fake);
    const result = await graphql({
      schema,
      source: `mutation($e: ID!, $d: ID!){ removeDependent(employerId: $e, dependentId: $d) { removed } }`,
      variableValues: { e: "emp-uuid", d: "dep-uuid" },
      contextValue: { devSub: "sub-broker-a" },
    });
    expect(result.errors).toBeUndefined();
    expect((result.data as any).removeDependent.removed).toBe(true);
    expect(calls[0].info.fieldName).toBe("removeDependent");
    expect(calls[0].info.parentTypeName).toBe("Mutation");
    expect(calls[0].identity.sub).toBe("sub-broker-a");
  });

  test("maps a thrown typed error into extensions.errorType", async () => {
    const fake: ResolverHandler = async () => {
      throw Object.assign(new Error("Not authorized for this employer"), { name: "Unauthorized", errorType: "Unauthorized" });
    };
    const schema = createDevSchema(fake);
    const result = await graphql({
      schema,
      source: `query($e: ID!, $py: ID!){ employees(employerId: $e, planYearId: $py) { nextToken } }`,
      variableValues: { e: "x", py: "y" },
      contextValue: { devSub: "sub-emp-admin-a" },
    });
    expect(result.errors?.[0]?.extensions?.errorType).toBe("Unauthorized");
    expect(result.errors?.[0]?.message).toContain("Not authorized");
  });
});
