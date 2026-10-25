# Authorized no-response/resume live verification — run 4

Only cumulative live ceilings changed: live_verification_runs 3 → 4 and business_api_calls 18 → 24. The controller hard ceiling now permits four six-request runs. Per-run requests remain six, output tokens remain 2048, and the coding-token limit remains 200000. All other configuration values are byte-equivalent after JSON decoding. No prior usage or evidence was reset. Controller enforcement tests: 25 passed, including rejection of run 5, seven requests per run, a 25-request configuration, exhausted runs before provider setup, and shared counting of failed/retried/cross-provider requests with mocked transport.

The overnight runner was not started. Direct verification acquired its existing exclusive lock and used the existing isolated worktree, database, persistent budget preload and private provider configuration. Both application phases shared active run 4 and its six-request allowance. The first three run records and their 18 total requests were verified unchanged. A pre-run SQLite backup and prior-accounting snapshot remain in the external state directory.

## Live results

Provider: Gemini. Scenario explicitly selected: no_response. Incident: bb6235fc-5056-4d29-b89f-5f42521c0068. Six provider requests total, all HTTP 200; no second attempt.

1. First application process: get_order_context → ask_driver. The no-response result persisted waiting immediately, with no driver reply or ETA and zero proposals/executions. No further model call occurred before that process exited.
2. Second application process reloaded the same waiting incident. Requesting Run before a reply consumed zero requests (global count remained 20) and left persisted history unchanged.
3. An explicit simulated driver event supplied ETA 13:00 UTC, safe, no blockers. Identical duplicate delivery caused no extra reply, task, event or model call.
4. Resume: check_booking_constraints → search_travel_options → check_option_constraints → create_proposal. Previously completed tasks/evidence were retained; no additional outreach occurred. Current driver report, original reservation and checked alternative grounded the proposal. Action cost/currency/departure/arrival matched the simulated quote.
5. Final state: needs_decision, proposal version 1, zero decisions, zero executions. An execute command without approval was rejected without changing persisted state. Duplicate reply delivery after proposal creation also had no additional effect. The source order/context remained unchanged.

Tested HEAD: a74a52b40c53cbe8577cf0b73a309c1ef83ad41a, plus the fingerprinted uncommitted waiting fix and pre-existing isolated work. This was not a claim that the focused commit alone includes all tested product changes. Code, effective scenario/reply inputs, runner configuration, private provider/runtime configuration hashes and the direct-check script hash were recorded before execution and matched afterward.

Private evidence, deliberately outside Git:

- ~/.local/state/car-delivery-overnight-validation/state/no-response-run-4-transport.jsonl
- no-response-run-4-persisted-waiting.json
- no-response-run-4-restart-without-reply.json
- no-response-run-4-explicit-reply.json
- no-response-run-4-resumed.json
- no-response-run-4-summary.json
- no-response-run-4-status.json (fingerprints/accounting)
- no-response-run-4-prior-accounting.json
- before-authorized-run-4.sqlite

## Outstanding acceptance and budgets

Iteration 2 remains pending, with two attempts preserved. Current corrected-code/configuration disproved-alert live acceptance is still unverified; this late-reply scenario does not establish safe early-arrival closure. Older delay/UI/build evidence is retained under its original fingerprints, not silently relabelled as a complete current acceptance receipt. A fresh full acceptance pass/build for the revised waiting code and configuration has not been recorded by this targeted run.

Final recorded usage: 4/4 live runs, 24/24 provider requests, 3/8 cycles, 301.53/14400 active seconds, 1 coding session and 749646 coding tokens against the unchanged 200000 ceiling. Remaining: zero live runs, zero provider requests, five cycles, 14098.47 active seconds and no coding-token capacity. Controller, active_process and app_process records are null. No coding session, merge or deployment occurred.
