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

  try {
    const a = event.arguments ?? {};
    switch (event.info.fieldName) {
      // --- Identity & employer selection ---
      case "me":
        return me(ctx);
      case "myEmployers":
        return myEmployers(ctx);
      case "employer":
        return employerService.getEmployer(ctx, a.employerId);

      // --- Plan years ---
      case "planYears":
        return employerService.listPlanYears(ctx, a.employerId);
      case "currentPlanYear":
        return employerService.currentPlanYear(ctx, a.employerId);

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
        throw new Error(`No resolver for field: ${event.info.fieldName}`);
    }
  } catch (e) {
    throw toGraphqlError(e);
  }
};

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

function toGraphqlError(e: unknown): Error {
  if (e instanceof AuthError) return Object.assign(new Error(e.message), { errorType: "Unauthorized" });
  if (e instanceof RoleMappingError) return Object.assign(new Error(e.message), { errorType: "Unauthorized" });
  if (e instanceof ValidationError) return Object.assign(new Error(e.message), { errorType: "ValidationError" });
  return e instanceof Error ? e : new Error(String(e));
}
