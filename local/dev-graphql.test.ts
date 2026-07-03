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

  test("dispatches planYearSetupStatus (Phase D-1) with the wrapped selection", async () => {
    const calls: any[] = [];
    const fake: ResolverHandler = async (event) => {
      calls.push(event);
      return {
        employerId: event.arguments.employerId,
        planYearId: event.arguments.planYearId,
        completionPct: 13,
        blockers: 0,
        steps: [{ key: "census_imported", label: "Census", description: null, category: "People", requiredByDefault: true, status: "complete", route: "/census", message: null }],
      };
    };
    const schema = createDevSchema(fake);
    const result = await graphql({
      schema,
      source: `query($e: ID!, $py: ID!){ planYearSetupStatus(employerId: $e, planYearId: $py) { employerId planYearId completionPct blockers steps { key status requiredByDefault } } }`,
      variableValues: { e: "emp-uuid", py: "py-uuid" },
      contextValue: { devSub: "sub-emp-admin-a" },
    });
    expect(result.errors).toBeUndefined();
    const data = (result.data as any).planYearSetupStatus;
    expect(data.completionPct).toBe(13);
    expect(data.blockers).toBe(0);
    expect(data.steps[0].key).toBe("census_imported");
    expect(calls[0].info.fieldName).toBe("planYearSetupStatus");
    expect(calls[0].arguments).toMatchObject({ employerId: "emp-uuid", planYearId: "py-uuid" });
    expect(calls[0].identity.sub).toBe("sub-emp-admin-a");
  });

  test("dispatches employerOverview (Phase D-4)", async () => {
    const calls: any[] = [];
    const fake: ResolverHandler = async (event) => {
      calls.push(event);
      return { employerId: "e", planYearId: "py", planYearLabel: "PY 2026", planYearStatus: "active",
        eligibleEmployees: 4, enrolled: 2, waived: 1, benefitPlans: 2, setupReadinessPct: 53, enrollmentPct: 50, launchBlockers: 0,
        needsAttention: [] };
    };
    const schema = createDevSchema(fake);
    const result = await graphql({
      schema,
      source: `query($e: ID!, $py: ID!){ employerOverview(employerId: $e, planYearId: $py) { planYearLabel eligibleEmployees enrolled benefitPlans setupReadinessPct needsAttention { key } } }`,
      variableValues: { e: "e", py: "py" }, contextValue: { devSub: "sub-emp-admin-a" },
    });
    expect(result.errors).toBeUndefined();
    const d = (result.data as any).employerOverview;
    expect(d.planYearLabel).toBe("PY 2026");
    expect(d.enrolled).toBe(2);
    expect(calls[0].info.fieldName).toBe("employerOverview");
    expect(calls[0].arguments).toMatchObject({ employerId: "e", planYearId: "py" });
  });

  test("dispatches planCatalog + benefitPlanDetail (Phase D-2)", async () => {
    const calls: any[] = [];
    const fake: ResolverHandler = async (event) => {
      calls.push(event);
      if (event.info.fieldName === "planCatalog") {
        return { employerId: "e", planYearId: "py", readOnly: false,
          summary: { total: 1, ready: 1, missingRates: 0, missingContributions: 0, missingDocuments: 1, launchBlockers: 0 },
          plans: [{ planId: "p", name: "UHC", carrier: "UHC", line: "medical", benefitType: "Medical", subtype: "PPO",
            status: "ready", effective: "2026-01-01", enrolled: 0, coverageTiers: 4, rateStatus: "complete",
            contributionStatus: "configured", contributionRule: "Standard", documentStatus: "missing",
            eligibleClasses: "Full-Time", launchBlocker: false, warnings: [] }] };
      }
      return { planId: "p", name: "UHC", carrier: "UHC", line: "medical", subtype: "PPO", network: null, fundingType: null,
        effective: "2026-01-01", renewalDate: null, enrolled: 0, status: "active",
        benefits: [], rates: [{ tier: "Employee Only", total: "$612.00", employer: "$489.60", employee: "$122.40" }],
        contributions: [], eligibility: [], documents: [] };
    };
    const schema = createDevSchema(fake);
    const cat = await graphql({
      schema,
      source: `query($e: ID!, $py: ID!){ planCatalog(employerId: $e, planYearId: $py) { summary { total } plans { planId line rateStatus } } }`,
      variableValues: { e: "e", py: "py" }, contextValue: { devSub: "sub-emp-admin-a" },
    });
    expect(cat.errors).toBeUndefined();
    expect((cat.data as any).planCatalog.plans[0].line).toBe("medical");
    const det = await graphql({
      schema,
      source: `query($e: ID!, $py: ID!, $p: ID!){ benefitPlanDetail(employerId: $e, planYearId: $py, planId: $p) { planId rates { tier employee } } }`,
      variableValues: { e: "e", py: "py", p: "p" }, contextValue: { devSub: "sub-emp-admin-a" },
    });
    expect(det.errors).toBeUndefined();
    expect((det.data as any).benefitPlanDetail.rates[0].employee).toBe("$122.40");
    expect(calls.map((c) => c.info.fieldName)).toEqual(["planCatalog", "benefitPlanDetail"]);
    expect(calls[1].arguments).toMatchObject({ employerId: "e", planYearId: "py", planId: "p" });
  });

  test("dispatches enrollmentProgress + enrollmentCenter (Phase D-3)", async () => {
    const calls: any[] = [];
    const fake: ResolverHandler = async (event) => {
      calls.push(event);
      if (event.info.fieldName === "enrollmentProgress") {
        return { employerId: "e", planYearId: "py", status: "In Progress", submitted: 2, inProgress: 1, notStarted: 0, notInvited: 1,
          byCoverage: [{ name: "Medical", elected: 2, waived: 0, pending: 1 }], reminders: null, byBenefit: null };
      }
      return { employerId: "e", planYearId: "py", launchState: "launched",
        launchReadiness: { planYearStatus: "active", readinessPercent: 53, canLaunch: true, launchState: "launched", blockers: [], warnings: [], checklist: [] },
        openEnrollmentSummary: { completionPercent: 50, eligible: 4, submitted: 2, inProgress: 1, notStarted: 0, needsAction: 1, enrolled: 2, waived: 1, lateMissing: 1, carrierFilesStatus: "Not started" },
        windows: [], ongoingWork: [] };
    };
    const schema = createDevSchema(fake);
    const prog = await graphql({
      schema,
      source: `query($e: ID!, $py: ID!){ enrollmentProgress(employerId: $e, planYearId: $py) { status submitted notInvited byCoverage { name elected } } }`,
      variableValues: { e: "e", py: "py" }, contextValue: { devSub: "sub-emp-admin-a" },
    });
    expect(prog.errors).toBeUndefined();
    expect((prog.data as any).enrollmentProgress.submitted).toBe(2);
    const center = await graphql({
      schema,
      source: `query($e: ID!, $py: ID!){ enrollmentCenter(employerId: $e, planYearId: $py) { launchState launchReadiness { readinessPercent canLaunch } openEnrollmentSummary { eligible } } }`,
      variableValues: { e: "e", py: "py" }, contextValue: { devSub: "sub-emp-admin-a" },
    });
    expect(center.errors).toBeUndefined();
    expect((center.data as any).enrollmentCenter.launchState).toBe("launched");
    expect(calls.map((c) => c.info.fieldName)).toEqual(["enrollmentProgress", "enrollmentCenter"]);
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
