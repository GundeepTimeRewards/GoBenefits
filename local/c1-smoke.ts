/**
 * Local C1 smoke test against the dev GraphQL endpoint (local/dev-graphql.ts).
 * NO AWS. Safe to run after `bun local/setup.ts` with the dev server running:
 *
 *   Terminal 1:  bun local/dev-graphql.ts
 *   Terminal 2:  bun local/c1-smoke.ts
 *
 * Config (env):
 *   GRAPHQL_ENDPOINT   default http://localhost:4000/graphql
 *   DEV_AUTH_SUB       default sub-emp-admin-a  (seeded employer_admin for Employer A)
 *
 * Exercises representative C1 reads end-to-end: me, myEmployers, planYears, employees,
 * employeeDetail, dependents. Exits non-zero if any step fails.
 */
const ENDPOINT = process.env.GRAPHQL_ENDPOINT ?? "http://localhost:4000/graphql";
const DEV_SUB = process.env.DEV_AUTH_SUB ?? "sub-emp-admin-a";

async function gql<T = any>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-dev-auth-sub": DEV_SUB },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await res.json()) as { data?: T; errors?: Array<{ message: string; extensions?: { errorType?: string } }> };
  if (body.errors?.length) {
    const e = body.errors[0];
    throw new Error(`${e.extensions?.errorType ?? "GraphQL"}: ${e.message}`);
  }
  return body.data as T;
}

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  const mark = cond ? "PASS" : "FAIL";
  if (!cond) failures++;
  console.log(`  [${mark}] ${label}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  console.log(`C1 smoke @ ${ENDPOINT} as ${DEV_SUB}`);

  const me = await gql<{ me: { userId: string; role: string; employerId: string | null } }>(`{ me { userId role employerId } }`);
  ok("me returns a user + role", Boolean(me.me?.userId) && Boolean(me.me?.role), `role=${me.me?.role}`);

  const emps = await gql<{ myEmployers: Array<{ employerId: string; name: string }> }>(`{ myEmployers { employerId name } }`);
  ok("myEmployers returns >=1 employer", (emps.myEmployers?.length ?? 0) >= 1, `count=${emps.myEmployers?.length}`);
  const employerId = emps.myEmployers?.[0]?.employerId;
  if (!employerId) throw new Error("no employer to scope subsequent reads");

  const pys = await gql<{ planYears: Array<{ id: string; label: string; periodStart: string }> }>(
    `query($e: ID!){ planYears(employerId: $e) { id label periodStart } }`,
    { e: employerId }
  );
  ok("planYears returns rows w/ AWSDate", (pys.planYears?.length ?? 0) >= 1 && /^\d{4}-\d{2}-\d{2}$/.test(pys.planYears?.[0]?.periodStart ?? ""), `count=${pys.planYears?.length}`);
  const planYearId = pys.planYears?.[0]?.id;

  const cur = await gql<{ currentPlanYear: { id: string; status: string } | null }>(
    `query($e: ID!){ currentPlanYear(employerId: $e) { id status } }`,
    { e: employerId }
  );
  ok("currentPlanYear resolves (or null)", true, `status=${cur.currentPlanYear?.status ?? "none"}`);

  const conn = await gql<{ employees: { items: Array<{ employeeId: string; lastName: string }>; nextToken: string | null } }>(
    `query($e: ID!, $py: ID!){ employees(employerId: $e, planYearId: $py) { items { employeeId lastName } nextToken } }`,
    { e: employerId, py: planYearId ?? "unused" }
  );
  ok("employees returns a connection", Array.isArray(conn.employees?.items), `count=${conn.employees?.items?.length}`);
  const employeeId = conn.employees?.items?.[0]?.employeeId;

  if (employeeId) {
    const detail = await gql<{ employeeDetail: { employeeId: string; firstName: string } | null }>(
      `query($e: ID!, $emp: ID!){ employeeDetail(employerId: $e, employeeId: $emp) { employeeId firstName } }`,
      { e: employerId, emp: employeeId }
    );
    ok("employeeDetail returns the employee", detail.employeeDetail?.employeeId === employeeId, `name=${detail.employeeDetail?.firstName}`);

    const deps = await gql<{ dependents: Array<{ dependentId: string }> }>(
      `query($e: ID!, $emp: ID!){ dependents(employerId: $e, employeeId: $emp) { dependentId } }`,
      { e: employerId, emp: employeeId }
    );
    ok("dependents returns an array", Array.isArray(deps.dependents), `count=${deps.dependents?.length}`);
  } else {
    ok("employeeDetail/dependents (no employees to sample)", true, "skipped");
  }

  console.log(failures === 0 ? "\nC1 smoke: ALL PASS" : `\nC1 smoke: ${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(`C1 smoke ERROR: ${(e as Error).message}`);
  process.exit(1);
});
