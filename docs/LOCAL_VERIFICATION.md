# GoBenefits V4 — Local Verification

How to verify the project locally. Two tiers:
- **Offline (no DB):** typecheck + unit tests. Runs anywhere with Bun.
- **Integration (needs MySQL):** bootstrap + tenant/census/dependent suites.

> Current state: offline tier is **green**; integration tier is **pending** a
> real MySQL (see `IMPLEMENTATION_STATUS.md`).

---

## Prerequisites
- **Bun** ≥ 1.1 (`bun --version`). Installs to `~/.bun`; ensure it's on PATH.
- **Integration only:** Docker + Compose v2 (MySQL 8.0 via `docker-compose.yml`).
- Node ≥ 20 optional (Bun runs the TS/tests).

All commands run from `GoBen-V4/V4Main`. Run `bun install` once first.

---

## Tier 1 — Offline (no Docker/MySQL)
```bash
bun install
bun run typecheck      # tsc --noEmit across all 4 packages
bun run test:unit      # pure validation + normalization + scope-decision tests
```
Expected: typecheck prints nothing per package (no errors); `test:unit` shows
**all pass, 0 fail** (currently 26 tests).

What Tier 1 covers:
- `employee` validation rules (required name/email, date formats, hire≤term, status enum)
- `employee_number` normalization (trim / blank→null / case preserved)
- `dependent` validation (relationship enum, required name, future-DOB rejection)
- tenant **scope decision** + **support-audit hook** (`decideEmployerAccess`) —
  platform/support/agency/explicit-access branches and archived fail-closed

What Tier 1 does NOT cover: anything touching MySQL (routing to the real
customer DB, SQL repositories, migrations, seed). That's Tier 2.

---

## Tier 2 — Integration (Docker + MySQL)
```bash
docker compose down -v        # clean slate (removes volume)
docker compose up -d
docker compose ps             # wait for mysql = "healthy"

cp local/.env.example .env    # root/goben, matches the container
bun install
bun run setup:local           # migrations + reference seed + test fixtures + sample employees
                              # expect: "Local setup complete."

bun run test:tenant           # tenant-isolation tests
bun run test:census           # census slice tests
bun run test:dependents       # dependents + employee-detail tests
bun test                      # full suite (offline + integration)
```
Expected: `setup:local` ends with `Local setup complete.`; each suite **passes,
0 fail**; `bun test` green across the board.

One-shot:
```bash
bun run verify:local          # setup:local && bun test
```

---

## Scripts (package.json)
| Script | Purpose | Needs MySQL? |
|---|---|---|
| `typecheck` | `tsc --noEmit` all packages | no |
| `test:unit` | offline unit tests | no |
| `setup:local` | bootstrap clean local DBs | yes |
| `test:tenant` | tenant-isolation suite | yes |
| `test:census` | census slice suite | yes |
| `test:dependents` | dependents + detail suite | yes |
| `test` | full suite | yes |
| `verify:local` | setup + full suite | yes |

---

## Troubleshooting (integration)
- **MySQL not ready** (`ECONNREFUSED`): wait for `docker compose ps` → healthy, re-run.
- **"table already exists"**: a partial apply didn't record `schema_migrations`.
  Reset: `docker compose down -v && docker compose up -d` (wait healthy) `&& bun run setup:local`.
- **Bun can't resolve `@goben/*`**: run `bun install` from `V4Main` (not a subfolder).
- **Duplicate seed errors**: shouldn't happen (idempotent seeds). For pristine
  counts, reset the volume.

## Notes
- App DB connections use `multipleStatements: false`; only the migration runner
  uses an isolated `multipleStatements: true` connection.
- Test-created rows (employees/dependents) use random UUIDs + timestamped
  numbers, so re-runs are safe and accumulate harmlessly.
