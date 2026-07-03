/**
 * AppSync Lambda resolver.
 *
 * Foundation + Phase C (C1) fields: identity (me), employer selection (myEmployers,
 * employer), plan years (planYears, currentPlanYear), census (employees,
 * employerCensusContext), employee detail + dependents, and their mutations.
 *
 * Every field follows the same contract: build the auth context from the Cognito
 * identity, then dispatch to a SERVICE that enforces permission x scope x tenant
 * routing (getCustomerDb) BEFORE any DB access. There is NO SQL, tenant, or
 * authorization logic in this file — and the public contract is `employerId`
 * (never `customerId`); a client-supplied employerId is a claim, authorized
 * server-side, never trusted raw.
 */
import {
  buildAuthContext,
  listAuthorizedEmployers,
  getBoundEmployerId,
  mapRoleKeyToGraphQL,
  RoleMappingError,
  AuthError,
  type AuthContext,
} from "@goben/data-access";
import { censusService, dependentService, ValidationError } from "@goben/census";
import { employerService } from "@goben/employer";

type AppSyncEvent = {
  info: { fieldName: string };
  identity?: { sub?: string; claims?: Record<string, unknown> };
  arguments: Record<string, any>;
};

export const handler = async (event: AppSyncEvent): Promise<unknown> => {
  const ctx = await buildAuthContext(event.identity?.sub).catch((e) => {
    throw toGraphqlError(e);
  });

  // `return await` is REQUIRED: dispatch returns a promise, and only awaiting it
  // inside this try lets the catch see a rejected field resolver. A bare
  // `return dispatch(...)` would adopt the promise and let its rejection bypass
  // toGraphqlError entirely (so error typing would silently not apply).
  try {
    return await dispatch(ctx, event.info.fieldName, event.arguments ?? {});
  } catch (e) {
    throw toGraphqlError(e);
  }
};

/** Field dispatch. Each case authorizes + routes inside its service (getCustomerDb);
 *  no auth/SQL/tenant logic here. Kept as its own awaited function so the handler's
 *  single try/catch reliably maps every field's errors. */
async function dispatch(ctx: AuthContext, fieldName: string, a: Record<string, any>): Promise<unknown> {
  switch (fieldName) {
    // --- Identity & employer selection ---
    case "me":
      return me(ctx);
    case "myEmployers":
      return myEmployers(ctx);
    case "employer":
      return employerService.getEmployer(ctx, a.employerId);
    // Employer Overview dashboard rollup (Phase D-4) — composes D-1/D-2/D-3.
    case "employerOverview":
      return employerService.employerOverview(ctx, a.employerId, a.planYearId);

    // --- Plan years ---
    case "planYears":
      return employerService.listPlanYears(ctx, a.employerId);
    case "currentPlanYear":
      return employerService.currentPlanYear(ctx, a.employerId);
    // Plan-year lifecycle mutations (Phase D-5) — create / renewal copy-forward /
    // activate (single-active invariant) / archive. All on `plan_year.manage`.
    case "createPlanYear":
      return employerService.createPlanYear(ctx, a.employerId, a.year, a.label);
    case "copyFromPriorYear":
      return employerService.copyFromPriorYear(ctx, a.employerId, a.fromPlanYearId, a.toYear);
    case "activatePlanYear":
      return employerService.activatePlanYear(ctx, a.employerId, a.planYearId);
    case "archivePlanYear":
      return employerService.archivePlanYear(ctx, a.employerId, a.planYearId);
    // Plan Year Setup checklist (Phase D-1) — derived aggregate read model.
    case "planYearSetupStatus":
      return employerService.planYearSetupStatus(ctx, a.employerId, a.planYearId);
    // Plans & Rates (Phase D-2) — server-computed catalog + plan detail.
    case "planCatalog":
      return employerService.planCatalog(ctx, a.employerId, a.planYearId);
    case "benefitPlanDetail":
      return employerService.benefitPlanDetail(ctx, a.employerId, a.planYearId, a.planId);
    // Plans & Rates mutations (Phase D-6) — add / duplicate on benefit_plan.manage,
    // rate-table replace on rate.manage, contribution upsert on contribution.manage.
    case "addPlan":
      return employerService.addPlan(ctx, a.employerId, a.planYearId, a.line, a.planName, a.carrierName);
    case "duplicatePlan":
      return employerService.duplicatePlan(ctx, a.employerId, a.planId);
    case "importRates":
      return employerService.importRates(ctx, a.employerId, a.planId, a.input);
    case "updateContributionRule":
      return employerService.updateContributionRule(ctx, a.employerId, a.input);
    // Enrollment Center / Progress (Phase D-3) — server-computed, read-only.
    case "enrollmentProgress":
      return employerService.enrollmentProgress(ctx, a.employerId, a.planYearId);
    case "enrollmentCenter":
      return employerService.enrollmentCenter(ctx, a.employerId, a.planYearId);
    // Enrollment mutations (Phase D-7) — all on `enrollment.manage`.
    case "launchEnrollment":
      return employerService.launchEnrollment(ctx, a.employerId, a.planYearId);
    case "sendEnrollmentReminders":
      return employerService.sendEnrollmentReminders(ctx, a.employerId, a.planYearId, a.audience);
    case "createEnrollmentWindow":
      return employerService.createEnrollmentWindow(ctx, a.employerId, a.planYearId, a.input);

    // --- Census (Module 1) ---
    case "employees":
      return {
        items: await censusService.listEmployees(ctx, a.employerId, { search: a.search, limit: a.limit }),
        nextToken: null,
      };
    case "employerCensusContext":
      return censusService.employerCensusContext(ctx, a.employerId, a.planYearId);
    case "createEmployee":
      // Input already carries `employerId` (Phase B contract) — pass through.
      return censusService.createEmployee(ctx, a.input);
    case "updateEmployee":
      return censusService.updateEmployee(ctx, a.input);

    // --- Employee detail + Dependents (Module 1b) ---
    case "employeeDetail":
      return dependentService.employeeDetail(ctx, a.employerId, a.employeeId);
    case "dependents":
      return dependentService.listDependents(ctx, a.employerId, a.employeeId);
    case "addDependent":
      return dependentService.addDependent(ctx, a.input);
    case "updateDependent":
      return dependentService.updateDependent(ctx, a.input);
    case "removeDependent":
      return dependentService.removeDependent(ctx, a.employerId, a.dependentId);

    default:
      throw new Error(`No resolver for field: ${fieldName}`);
  }
}

/** Identity read model. `role` is mapped to the GraphQL Role enum (fails closed on
 *  an unmapped DB role key); `employerId` is the bound employer for single-employer
 *  personas (null for broker/agency/platform, who use the employer selector). */
async function me(ctx: AuthContext) {
  const role = mapRoleKeyToGraphQL(ctx.user.roleKey);
  const employerId = await getBoundEmployerId(ctx.user);
  return { userId: ctx.user.id, role, agencyId: ctx.user.agencyId, email: ctx.user.email, employerId };
}

/**
 * Book-of-business / employer-picker list. Control-plane ONLY — it must NOT fan out
 * across tenant DBs to compute per-employer metrics (decision R1). Per-tenant fields
 * (counts, current plan year, enrollment) are nullable in the contract and stay null
 * in C1; the aggregate read-model populates them later.
 */
async function myEmployers(ctx: AuthContext) {
  const list = await listAuthorizedEmployers(ctx.user);
  return list.map((e) => ({
    employerId: e.id,
    name: e.legalName,
    industry: null,
    employeeCount: null,
    activeCount: null,
    currentPlanYearId: null,
    currentPlanYearLabel: null,
    setupStatus: null,
    enrollmentState: null,
    completion: null,
    issues: null,
    renewalMonth: null,
    agency: null,
    broker: null,
  }));
}

/**
 * Normalize errors for AppSync. The AWS Lambda runtime reports a thrown error's
 * `name` as the invocation's `errorType`, and AppSync's APPSYNC_JS response handler
 * surfaces that via `ctx.error.type` -> `util.error(message, type)`. So we set BOTH
 * `name` (the channel AppSync actually reads) and `errorType` (kept for direct
 * inspection / existing callers). Unauthorized and ValidationError become typed
 * client errors; everything else is an untyped internal error (message preserved,
 * no leak of internal error class names).
 */
function typedError(name: "Unauthorized" | "ValidationError", message: string): Error {
  return Object.assign(new Error(message), { name, errorType: name });
}

/**
 * Classification is by the error's stable `name`, NOT `instanceof`. The deployed
 * resolver is esbuild-BUNDLED (see infra/template.yaml BuildMethod: esbuild); a
 * class reachable through more than one import path can be duplicated in the bundle,
 * which silently breaks cross-module `instanceof` (AuthError from @goben/data-access,
 * ValidationError from @goben/census). Each domain error sets a distinctive `name`
 * (AuthError / RoleMappingError / ValidationError), so name matching is
 * bundling-robust and matches what the Lambda runtime already reports. `instanceof`
 * is kept as a belt-and-suspenders secondary.
 */
function toGraphqlError(e: unknown): Error {
  if (e instanceof Error) {
    const name = e.name;
    if (e instanceof AuthError || e instanceof RoleMappingError || name === "AuthError" || name === "RoleMappingError") {
      return typedError("Unauthorized", e.message);
    }
    if (e instanceof ValidationError || name === "ValidationError") {
      return typedError("ValidationError", e.message);
    }
    return e; // untyped internal error — message preserved, no class-name leak
  }
  return new Error(String(e));
}
