# Dev deploy runbook — `goben-dev` first-time foundation deploy

> **Scope:** stand up the `goben-dev` stack and make the **C1 backend smoke tests pass**.
> This is a **first-time full-foundation CREATE** (Aurora, RDS Proxy, Cognito, KMS,
> Secrets, S3, EventBridge, Lambdas, AppSync + 14 C1 resolvers), not an incremental
> resolver update. **No production. No `sam deploy` without explicit approval.**
>
> This runbook assumes FOUNDATION-DEPLOY-1 is applied: network SGs + rules, VPC
> interface endpoints (Secrets Manager / KMS / Logs / X-Ray), Aurora & RDS Proxy SG
> associations, `DBProxyTargetGroup`, the `control_plane` DB bootstrap in `DbMigratorFn`,
> and RDS Proxy TLS in the connection pool.

## 0. Prerequisites
- AWS account/region confirmed (dev account; set `AWS_REGION`).
- A dev **VPC** with DNS support/hostnames enabled (interface endpoints need it).
- **≥2 private subnets in different AZs** (Aurora subnet group requires multi-AZ).
- `bun install` has run (workspace packages present for `sam build`).

## 1. Build
```bash
sam build --template infra/template.yaml
# (or, faster on a dev host: sam build --build-in-source --template infra/template.yaml)
```

## 2. Review-only (no-execute) changeset
```bash
sam deploy \
  --template-file .aws-sam/build/template.yaml \
  --stack-name goben-dev \
  --capabilities CAPABILITY_IAM \
  --resolve-s3 \
  --no-execute-changeset \
  --parameter-overrides Env=dev VpcId=<VPC_ID> PrivateSubnetIds="<SUBNET_A>,<SUBNET_B>" DbMinACU=0.5 DbMaxACU=4

aws cloudformation describe-change-set --change-set-name <CHANGESET_ARN> \
  --query 'Changes[].ResourceChange.{Action:Action,Type:ResourceType,Id:LogicalResourceId,Replacement:Replacement}' \
  --output table
```
**Required parameters:** `Env=dev`, `VpcId`, `PrivateSubnetIds` (comma-separated).
Optional: `DbMinACU` (0.5), `DbMaxACU` (4). On a first deploy every row should be
**`Add`** with **no `Replacement`**. Execute only after approval:
`aws cloudformation execute-change-set --change-set-name <CHANGESET_ARN>`.

## 3. Post-deploy: read stack outputs
```bash
aws cloudformation describe-stacks --stack-name goben-dev \
  --query 'Stacks[0].Outputs' --output table
# GraphQLApiUrl, UserPoolId, UserPoolClientId, DbProxyEndpoint, DocumentsBucket
```

## 4. Run the migrator (bootstraps + migrates control_plane)
`DbMigratorFn` now creates `control_plane` if missing (Aurora has no default DB), then
applies control-plane migrations (schema + reference seed, incl. the broker
`plan_year.read` grant).
```bash
MIGRATOR=$(aws cloudformation describe-stack-resource --stack-name goben-dev \
  --logical-resource-id DbMigratorFn --query 'StackResourceDetail.PhysicalResourceId' --output text)
aws lambda invoke --function-name "$MIGRATOR" /dev/stdout
# expect: {"applied":["0001_init.sql","0002_seed_reference_data.sql","0003_phase_c_grants.sql"]}
```

## 5. Create a Cognito test user + get its real `sub`
```bash
UP=<UserPoolId>
aws cognito-idp admin-create-user --user-pool-id "$UP" --username hr.a@dev --message-action SUPPRESS
aws cognito-idp admin-set-user-password --user-pool-id "$UP" --username hr.a@dev --password 'Str0ng!Passw0rd' --permanent
# Real Cognito sub (this is what event.identity.sub carries):
SUB=$(aws cognito-idp admin-get-user --user-pool-id "$UP" --username hr.a@dev \
  --query 'UserAttributes[?Name==`sub`].Value' --output text); echo "$SUB"
```

## 6. Provision one test tenant + seed identity/plan year (one invoke, no bastion)
`TenantProvisionerFn` creates the customer DB, applies the customer schema, registers the
employer in `control_plane.employer`, and — with the **optional seed fields** — also
upserts the smoke user (`user_account` bound to the REAL `<SUB>`), its
`user_employer_access` grant, and one **active plan year** in the tenant DB. This
replaces the old manual-SQL step: **no bastion or direct Aurora access is needed**
(Aurora is in private subnets; the provisioner Lambda runs inside the VPC).
```bash
PROVISIONER=$(aws cloudformation describe-stack-resource --stack-name goben-dev \
  --logical-resource-id TenantProvisionerFn --query 'StackResourceDetail.PhysicalResourceId' --output text)
aws lambda invoke --function-name "$PROVISIONER" \
  --payload "{\"legalName\":\"Dev Employer A\",\"adminCognitoSub\":\"$SUB\",\"adminEmail\":\"hr.a@dev\",\"seedPlanYear\":2026}" \
  --cli-binary-format raw-in-base64-out /dev/stdout
# → { employerId, dbName, applied, adminUserId, planYearId }
#   note employerId (<EMP_ID>) and planYearId (<PY>) for the smoke tests below.
```
Seed-field notes:
- All seed fields are **optional** — omit them and the provisioner behaves exactly as before.
- `adminRoleKey` defaults to `employer_admin`; only employer-scoped roles are allowed
  (`employer_admin`, `broker`, `employer_read_only`, `employee`) — platform/support/agency
  roles are rejected (no privilege escalation via bootstrap).
- The seed is **idempotent**: re-invoking with the same payload updates rather than
  duplicates (`cognito_sub`, access-grant PK, and `plan_year.year` unique keys).
- `seedPlanYear` accepts a bare year (`2026` → "2026 Benefits", active) or
  `{ "year": 2026, "label": "...", "status": "setup|active|archived" }`.

## 7. Get an ID token (dev smoke-test client)
Use the **dev-only smoke-test client** (`DevTestUserPoolClientId` stack output; created
only when `Env=dev` via the `IsDev` condition — staging/prod never create it). It allows
`ADMIN_USER_PASSWORD_AUTH` so no SRP helper is needed. The **primary app client remains
SRP-only** (production posture) — do not modify it for testing.
```bash
DEV_CLIENT=<DevTestUserPoolClientId>   # from stack outputs (dev only)
aws cognito-idp admin-initiate-auth --user-pool-id "$UP" --client-id "$DEV_CLIENT" \
  --auth-flow ADMIN_USER_PASSWORD_AUTH \
  --auth-parameters USERNAME=hr.a@dev,PASSWORD='Str0ng!Passw0rd' \
  --query 'AuthenticationResult.IdToken' --output text
```
Use the **ID token** as the `Authorization` header below. Note: the pool has
**optional TOTP MFA** (`SOFTWARE_TOKEN_MFA`); test users that haven't enrolled an
authenticator simply sign in with password only.

## 8. C1 smoke checklist — all 14 operations
POST to `GraphQLApiUrl` with header `Authorization: <ID token>`. `<EMP>` = `<EMP_ID>`.

Queries:
1. `me` → `{ userId, role: "employer_admin", employerId: <EMP> }`
2. `myEmployers` → `[{ employerId, name }]`; per-tenant metrics **null** (no fan-out)
3. `employer(employerId:<EMP>)` → `{ employerId, name, employeeCount, currentPlanYearId }`
4. `planYears(employerId:<EMP>)` → array; `periodStart` is `YYYY-MM-DD`
5. `currentPlanYear(employerId:<EMP>)` → the active plan year (or null)
6. `employerCensusContext(employerId:<EMP>, planYearId:<PY>)` → all non-null counts present
7. `employees(employerId:<EMP>, planYearId:<PY>)` → `{ items, nextToken }`
8. `employeeDetail(employerId:<EMP>, employeeId:<E>)` → profile
9. `dependents(employerId:<EMP>, employeeId:<E>)` → array

Mutations:
10. `createEmployee(input:{ employerId:<EMP>, firstName, lastName })` → created row
11. `updateEmployee(input:{ employerId:<EMP>, employeeId:<E>, firstName, lastName })`
12. `addDependent(input:{ employerId:<EMP>, employeeId:<E>, firstName, lastName, relationship })`
13. `updateDependent(input:{ employerId:<EMP>, dependentId:<D>, firstName, lastName, relationship })`
14. `removeDependent(employerId:<EMP>, dependentId:<D>)` → `{ removed: true }`

Example (query 1):
```bash
curl -s "$GRAPHQL_URL" -H "Authorization: $ID_TOKEN" -H 'Content-Type: application/json' \
  -d '{"query":"{ me { userId role employerId } }"}'
```

## 9. Negative tests (the ones only a live stack can prove)
- **Unauthorized (cross-tenant):** as a user scoped to `<EMP>`, query
  `employees(employerId:"<OTHER_EMP>")` → GraphQL error with **`errorType: "Unauthorized"`**.
- **ValidationError:** `createEmployee(input:{ employerId:<EMP>, firstName:"No", lastName:"" })`
  → GraphQL error with **`errorType: "ValidationError"`**.
- These confirm the esbuild-bundled handler's `name`-based error classification and the
  APPSYNC_JS `response` (`ctx.error.type`) surface typed errors through real AppSync.

## 10. Teardown (stop dev cost)
```bash
aws s3 rm "s3://$(DocumentsBucket)" --recursive   # empty the bucket first if non-empty
sam delete --stack-name goben-dev
```
Aurora Serverless v2 (min 0.5 ACU) + RDS Proxy bill continuously — delete the stack when
not actively testing.
