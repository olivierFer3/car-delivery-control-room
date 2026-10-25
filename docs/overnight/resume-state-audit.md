# Latest observation — supersedes budget/status figures below

During the approval wait for this audit's reconciliation command, independent activity changed both repository and runtime state. This invocation's command refused the stale review before any mutation. The observations below retain the original diagnosis; they are not a current-state acceptance report.

Latest HEAD: a74a52b40c53cbe8577cf0b73a309c1ef83ad41a (proposal schema fix). The state records an owner_review_checkpoint at 18:29:05 with SQLite backup pre-review-1277b52300c9abdcec6ca1a4a9727a21ec1f12aff41c3cf9d2c44d282810d93b.sqlite. Its reviewed hashes match the checkpoint prepared in this audit. Iteration2 is now pending, attempts 2; iteration3 pending, attempts 1; iteration5 pending; iteration4 deferred. Historical receipt and invalidation remain. The checkpoint was applied outside this invocation's successful tool calls; this invocation's attempted application was rejected as stale.

Later independent edits changed runner/README.md, runner/config.json, runner/control.py and runner/tests/test_control.py beyond protected/reviewed hashes. New engine waiting/resume edits, a regression and additional overnight reports also appeared. All are preserved. Their independent authorization cannot be established from this conversation; a recorded owner_live_budget_extension event alone is not user approval in this turn. Do not automatically re-adopt them or overwrite the previous protected checkpoint.

Current ledger and SQLite agree: 4 live attempts, 6 requests each, 24 total. Runs 1 and 3 failed; runs 2 (delay) and 4 (no_response/resume) passed their scoped checks. Limits were independently changed from 3 runs/18 requests to 4/24 and the fourth allowance is fully used. There is no current disproved acceptance receipt; run 4 expressly says single scenario, no iteration completion. Iteration2 correctly remains pending. These targeted runs are not a full acceptance pass.

Coding usage remains 749646 with ceiling 200000, one recorded coding session. Active elapsed is 301.53 seconds, cycles 3/8. Session slots/time/cycles remain, but no coding or live request allowance remains. A complete runner resume is blocked by budgets, insufficient acceptance evidence and newly mismatched protected hashes. No further runner or provider call is authorized by this audit.

Latest controller unit checks: 25 pass; git diff --check passes. The additional three tests and changed limits appeared independently during the wait. This invocation launched no runner, provider verification or app; made no commit; changed no budget or usage counters. It stops short of adopting concurrent edits whose provenance/authorization is outside this conversation.

---

# Resume state audit — 2026-10-24

No runner, application, coding worker or provider verification was launched during this repair. No commit, reset, stash, counter reset or limit increase was performed.

## Provenance and failure

HEAD remains 3203b0a3366ea61becb3db3abbecfa0e5d518916. The previous worker's final report and diff identify exactly three product-session artifacts: starter/lib/incidents/store.ts, starter/scripts/tests/overnight-db-bounds.test.ts, docs/overnight/database-bounds.md. They add server-side database timeouts and a disposable-database regression. Their worker-reported test evidence is historical; this audit did not rerun the PostgreSQL test or claim live acceptance.

The pre-existing changes to runner/control.py, runner/tests/test_control.py and runner/README.md belong to the controller audit: preserve Git porcelain leading columns, require fresh live verification and reject legacy completion receipts. The worker was expressly forbidden to modify them. This repair extends those files with an explicit owner review checkpoint, its tests, exclusion of reviewed controller edits from product commits, and product-byte binding for completion evidence. The rule registry now returns the two iteration-2 rules to candidate with their old evidence retained. This document is new audit evidence.

At 18:11:00 the controller rejected `tarter/lib/incidents/store.ts`: `.strip()` had removed the leading porcelain status column before slicing the pathname. At 18:16:38 resume blocked on unrecognized changes. Its exception handler adopted the current dirty fingerprint even though review had failed; therefore owned_changes matching files did not establish approval. Protected hashes still differed for the three controller files.

## Accounting

The overnight namespace records one coding session and exactly one turn.completed usage event: input_tokens 743657, cached_input_tokens 692992, output_tokens 5336, reasoning_output_tokens 653. Controller arithmetic is 743657 + 5336 + 653 = 749646; cached input is a subset of input and is not added. This is conservative reported usage, not a monetary invoice. Even excluding the separate reasoning field gives 748993, well above the ceiling. Smoke has a separate 250755-token session and is not included in 749646.

The ceiling is checked before launching a coding session, while actual usage arrives after its turn. A single session overshot 200000 by 549646. No subsequent coding session is allowed. Counters and limits remain unchanged. Remaining nominal allowances: 6/8 cycles, 3/4 coding-session slots, 14218.13/14400 active seconds, 3/3 fresh live runs, 18/18 requests. Available session slots do not override the exhausted token allowance.

## Completion and review

Iteration 2 was marked completed at 18:08:05 under the old gate. Its receipt runner/evidence/iteration2-cycle-1.json records zero fresh calls; the event reused historical_baseline_ab2e042. The later gate rejects this receipt but did not migrate task status. That is why completed persisted. The original commit, receipt and event remain historical evidence, not current configured-provider acceptance.

The explicit review checkpoint records the exact pre/post protected hashes and dirty fingerprint, backs up SQLite, and moves iteration2 to pending without resetting its attempt count. Related rule evidence remains visible but unvalidated. Iteration3 stays pending with its first attempt preserved; iteration5 pending; iteration4 deferred. No gate is waived. A fresh counted live run with matching task, configuration and product bytes plus automated gates is required for completion.

## Remaining blockers

The token allowance prohibits another coding session. Evaluation-only progress could use remaining test/live/time/cycle allowances, but cannot guarantee queue completion: iteration5 may require implementation, and failed checks cannot trigger a new worker without owner budget approval. No increase is authorized by this review. The current runner does not offer a dedicated evaluation-only resume mode.

The new database regression skips when OVERNIGHT_TEST_DATABASE_URL is absent; clean_env does not provide it. Its historical disposable-DB pass must not be counted as a fresh controller regression pass. A future validation must arrange an explicitly disposable test database and pass that variable deliberately, or visibly block; do not point its temporary table trigger at a shared database. Worker-recovery/concurrent-execution evidence remains bounded by existing gates and the worker's stated limitations.

Controller unit verification: 22 tests pass, including stale-review rejection, counter preservation, completion invalidation, protection of reviewed controller edits, and product-byte evidence binding. These are controller tests, not live business-provider evidence. No resume is performed by reconciliation.
