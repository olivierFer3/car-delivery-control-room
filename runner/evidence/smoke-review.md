# Iteration-2 smoke review

Reviewed 2026-10-24 in one bounded coding CLI session on `agent/overnight-validation`. No product changes or business-provider calls were made.

Inspected: root `README.md`, `runner/README.md`, `starter/AGENTS.md`, `starter/package.json`; `starter/lib/incidents/{engine,booking-check,providers,service,store,http}.ts`; `starter/app/api/incidents/route.ts` and `[id]/route.ts`; `starter/scripts/tests/iteration2.test.ts`, targeted searches of the incidents/dataset regression tests, and `starter/scripts/{verify-iteration2.ts,smoke-iteration2.mjs}`.

Checks actually run by this reviewer from `starter/`, with a clean environment (PATH retained, HOME=/tmp; no credential files loaded):

- `node --import tsx --test scripts/tests/incidents.test.ts scripts/tests/dataset.test.ts scripts/tests/iteration2.test.ts` — passed, three test files, zero failures.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false` — passed.

The inspected paths enforce current-version approval, evidence-backed proposals, deterministic booking checks, simulated execution receipts, row-locked mutations and lease-fenced checkpoints. Regression provider transports use test doubles; these results are not fresh live-provider verification.

The task reports prior development checks passed and no development failures. Isolated PostgreSQL/HTTP gates were not rerun or independently verified by this reviewer; their results belong to the surrounding controller. No controller state, held-out scenarios, environment files, provider credentials, source checkout or shared database were accessed. Live verification and browser smoke scripts were inspected only, not executed.

Remaining risks: mocked transports cannot establish current provider availability or model behavior; static review and in-memory regressions cannot establish actual PostgreSQL concurrency, HTTP runtime or rendered UI behavior. Those require the separate isolated gates. This bounded review does not establish bug-freedom. No demonstrated regression justified a speculative change.
