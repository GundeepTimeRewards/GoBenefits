# GoBenefits V4

Modern rewrite of GoBenefits (legacy: CloudHCM, .NET + SQL Server, database-per-tenant).

Multi-tenant benefits administration SaaS for **Agency → Broker → Employer → Employee**.

> The Lovable project at `../gobenefits-e92b2d8b` is a **visual reference only**.
> All screens are rebuilt here. See `../IMPLEMENTATION_PLAN.md` for the full plan.

## Stack

AWS-native serverless — **AppSync (GraphQL) · Lambda (TypeScript) · Aurora MySQL
Serverless v2 (database-per-customer) · Cognito · S3 · SQS · EventBridge · Step
Functions · SES**. IaC via **AWS SAM** + CloudFormation. HIPAA from day one.

## Monorepo layout

```
apps/web/          Rebuilt frontend (TanStack Start + React 19 + Tailwind + shadcn/ui)
api/               AppSync GraphQL
  schema.graphql     GraphQL SDL (the API contract)
  resolvers/         Lambda resolvers (TypeScript)
packages/
  shared/            Shared TS types + the golden-master rate engine
  data-access/       Tenant routing + per-customer DB connection layer
db/
  migrations/
    control-plane/   Shared DB: agencies, brokers, customer registry, global catalog
    customer/        Per-customer DB schema (applied identically to every tenant DB)
migration/         Legacy ETL: Lambda + scripts (extract SQL Server -> transform -> load)
infra/             SAM templates + CloudFormation (Aurora, RDS Proxy, Cognito, VPC, KMS)
```

## Tenancy

- **Database-per-customer** (Option A): one logical DB per employer inside a shared
  Aurora cluster, plus a shared **control-plane** DB.
- **Tenant routing replaces RLS:** every resolver derives the customer from the
  Cognito identity → tenant registry → DB connection. Tenant id is **never** taken
  from client input. This is the #1 security control.
