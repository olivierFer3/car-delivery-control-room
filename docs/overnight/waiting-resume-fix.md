# No-response suspension and same-incident resume

## Demonstrated cause and focused correction

The engine previously entered waiting for an unanswered ask_driver only when mode was not llm. In a real-agent run, the same tool result left state investigating. Repeated asks reused the prior result (preventing additional outreach) but consumed more model calls until the live request allowance was exhausted. The model was incorrectly responsible for choosing a separate wait tool after the external service had already supplied no new information.

The engine now treats a recorded no-response without a new driver reply as an external-event boundary. After the unanswered question is recorded, it enters waiting, records the missing reply and stop reason, and checkpoints through the existing run loop. No subsequent model call is made in that run. A run requested on a previously saved unanswered question also checkpoints waiting and returns before calling a provider, including recovery from the old technical_error state. Existing completed independent checks, evidence and history are retained. The engine does not add speculative checks while the run is suspended and does not manufacture any reply, ETA or safety claim.

The existing explicit receive_driver_reply mechanism resumes the same incident. Exact retries of its one incident-local reply are now idempotent even after processing/completion: no duplicate reply, task, evidence, timeline event, reopening or effects. Conflicting retry data is rejected. The existing row lock serializes concurrent deliveries. New reply validation, current-source/booking checks, proposal versions, human approval and separate execution remain enforced. No schema migration, runner or provider configuration change is needed for this product correction.

Product edit in this task: starter/lib/incidents/engine.ts only. New focused regression: starter/scripts/tests/overnight-wait-resume.test.ts. Earlier database timeout changes, controller work and historical evidence were preserved. No commit, merge or deployment was requested/performed in this task.

## Verification

The four new deterministic unit cases failed against the original behavior, then passed after the fix. The new suite covers:

1. Immediate checkpointed waiting on no response; previously completed independent search results retained; no extra model call, invented reply or ETA.
2. Recovery from a saved legacy no-response, repeat ask reuse with one outreach, and repeated Run without new information consuming zero model calls.
3. Same-incident explicit reply/resume; identical reply retries are no-ops; conflicting reports fail; history remains intact.
4. A late reply still needs evidence-backed proposal creation, current-version approval and separate execution; duplicate reply/execution causes no additional effect.
5. Real isolated PostgreSQL persistence across two separate application processes. First process persists waiting and exits; second process reloads it, verifies zero model calls on a premature Run, delivers duplicate reply commands concurrently, then resumes the same incident. One reply event/task is recorded; original history and question are retained. Duplicate delivery after resolution does not change persisted history.

Provider fetch is locally mocked in both database workers, with a fictional test credential; the mock never calls the original fetch. The database case used the existing isolated controlroom_overnight_validation database on 127.0.0.1:15438 and created fresh demo incidents without resetting/deleting earlier histories. It passed with four mocked model calls total: context, ask, then booking check and close after the explicit safe early reply. This is deterministic integration evidence, not live-provider verification.

Final results: new suite 5/5, existing incident suite 15/15, iteration-2 suite 10/10, proposal-contract suite 3/3. Total **33 tests passed, zero skipped**. The database case was initially skipped when run without its explicit environment, then actually executed successfully with the isolated database configured; no skipped run was counted as verification. TypeScript `--noEmit --incremental false` and `git diff --check` pass.

## State and additional live allowance

A before/after comparison confirmed the complete selected controller state, persistent API ledger bytes and runner configuration bytes are unchanged. No live-provider request or coding session was made, no runner/app was started, and no usage counter or limit was changed. State remains blocked; iteration2 remains pending with two attempts. Recorded usage remains 3 cycles, 272.76 active seconds, 1 coding session, 749646 coding tokens, 3 live runs and 18 provider requests. There is no remaining live or coding-token allowance.

To test the complete revised no_response/resume behavior live, the requested additional envelope is **one new Gemini verification run with at most six provider requests total, including all initial investigation, resume and retry calls**. The deterministic happy path uses four model calls, leaving two within that envelope for additional model-selected checks/retries; successful live completion within six is not guaranteed. It must explicitly select no_response, persist/read waiting before injecting an explicit simulated reply, resume that same incident and stop on failure.

If separately authorized, this would require cumulative live ceilings of four runs and 24 requests, preserving all previous usage; the existing controller hard ceiling of three live runs also needs explicit review before a fourth can be supported. No such budget/configuration/controller change was made or authorized by this fix. Passing this one live scenario would not alone establish every outstanding iteration-2 acceptance criterion.
