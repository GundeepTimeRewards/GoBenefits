# SAM custom build (BuildMethod: makefile) for the three Lambda functions.
#
# Why this exists: SAM's built-in `esbuild` builder copies each function's CodeUri in
# isolation and runs `npm install`, which fails because @goben/data-access, @goben/census
# and @goben/employer are LOCAL bun-workspace packages ("*"), not published to npm
# (npm 404). Instead we bundle each entrypoint with esbuild directly, INLINING the
# @goben/* workspace code into a single ESM artifact. Nothing is fetched from npm.
#
# Clean-checkout robustness: SAM copies the source to a scratch build dir before running
# these targets, which does NOT preserve bun's symlinked node_modules store (breaking
# mysql2's transitive deps such as lru.min / aws-ssl-profiles). So each target first runs
# `bun install` to (re)materialize a correct node_modules in whatever directory the build
# runs in — the same standard install any clean checkout needs. `.samignore` keeps the
# host node_modules out of that copy so the install is clean and fast, not a symlink copy.
#
# SAM invokes `make build-<FunctionLogicalId>` with ARTIFACTS_DIR = the SAM output dir.
# ONLY the built .mjs (+ .map) we write there is packaged — node_modules is NOT shipped.
#
# Handler mapping is preserved (SAM `Handler: <file>.handler` -> $(ARTIFACTS_DIR)/<file>.mjs):
#   GraphqlResolverFn    handler.handler   -> handler.mjs    (api/resolvers/src/handler.ts)
#   DbMigratorFn         migrate.handler   -> migrate.mjs    (migration/runner/src/migrate.ts)
#   TenantProvisionerFn  provision.handler -> provision.mjs  (migration/runner/src/provision.ts)
#
# @aws-sdk/* is left external — provided by the nodejs20.x Lambda runtime. `.mjs` output
# is unconditionally ESM (no package.json "type" needed), matching the esm handler config.

ESBUILD       = bunx esbuild
ESBUILD_FLAGS = --bundle --platform=node --format=esm --target=es2022 '--external:@aws-sdk/*' --sourcemap

# Materialize a correct node_modules in the build directory (clean-checkout safe).
# `--linker hoisted` produces a FLAT node_modules (npm-style) instead of bun's default
# symlinked/isolated store. esbuild follows symlinks to real paths and then can't find a
# dep that is only linked as a sibling in the isolated store (mysql2's denque / lru.min /
# aws-ssl-profiles / sql-escaper). A hoisted tree resolves them by normal walk-up. This
# only affects the build directory's install, not the repo's dev install.
deps:
	bun install --linker hoisted

build-GraphqlResolverFn: deps
	$(ESBUILD) api/resolvers/src/handler.ts $(ESBUILD_FLAGS) --outfile="$(ARTIFACTS_DIR)/handler.mjs"

build-DbMigratorFn: deps
	$(ESBUILD) migration/runner/src/migrate.ts $(ESBUILD_FLAGS) --outfile="$(ARTIFACTS_DIR)/migrate.mjs"

build-TenantProvisionerFn: deps
	$(ESBUILD) migration/runner/src/provision.ts $(ESBUILD_FLAGS) --outfile="$(ARTIFACTS_DIR)/provision.mjs"
