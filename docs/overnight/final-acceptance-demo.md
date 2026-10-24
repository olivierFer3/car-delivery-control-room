# Focused commit, UI acceptance and final live allowance

Focused commit: `a74a52b40c53cbe8577cf0b73a309c1ef83ad41a` (`Align proposal tool schema with engine contract`). It includes only engine.ts, providers.ts, proposal-contract.ts and overnight-proposal-contract.test.ts. The database timeout work, runner modifications, reports, credentials and live traces were excluded. The prior focused verification passed 28 tests, typecheck and diff checks. No additional product changes were made in this follow-up.

## Browser verification

The isolated app ran temporarily at http://127.0.0.1:3107 without provider credentials. Headless Chrome inspected the real Gemini delay incident `7e733c30-7952-4bc7-84f2-e38a86dd5afa` and expanded its original reservation evidence. Every proposal citation was present in the rendered sources.

- Authenticated execute before approval returned 409 and left zero executions.
- Browser approved version 1. The persisted state was approved with zero executions, and the UI explicitly said no change had been applied.
- A separate click on Apply approved simulated change produced one successful version-1 receipt.
- Two concurrent repeat execute requests returned HTTP 200 with that identical receipt; no second effect was recorded. This is idempotent duplicate prevention, not a duplicate-request HTTP rejection.
- Reload retained the result and removed the apply button. The source order API response was unchanged. No browser page errors occurred.

Private evidence remains outside Git in `~/.local/state/car-delivery-overnight-validation/state/`: ui-proposal-flow.json, ui-evidence-review.png, ui-approved-no-execution.png and ui-executed-once.png. The app was stopped afterward; the overnight runner was never started.

## Final live attempt

Run 3 explicitly selected Gemini/no_response. Initial investigation and intended resume shared one persistent six-request allowance, including retries. The complete attempt used six real requests, all HTTP 200: get_order_context → ask_driver → check_booking_constraints → ask_driver → ask_driver → ask_driver. The engine reused its saved no-response result for repeat asks, so only one simulated outreach was recorded. No reply/ETA was invented.

It did not select wait. The LLM path leaves the incident investigating until a model-selected stopping tool changes state, and repeated ask_driver returns the saved no-response result without making that transition. The six-request allowance was exhausted and the incident persisted technical_error, not waiting. This is the demonstrated gap. No driver reply was injected and no resume was attempted after failure. Incident: `1162123c-c739-43fa-b5db-6d6feab253f8`.

Smallest next correction to consider, not implemented: make a recorded no-response an explicit waiting boundary, or constrain/validate the subsequent tool choice to wait, with a regression covering repeated ask_driver against a saved no-response. Preserve evidence attribution and idempotent outreach. Successful waiting/resume still needs separate verification; no further live allowance remains.

Private transport, failure, persisted incident and fingerprint evidence: no-response-run-3-transport.jsonl, no-response-run-3-failed-incident.json, no-response-run-3-failure.json, no-response-run-3-status.json. They remain outside the repository. Tested HEAD is a74a52b; fingerprints include dirty product bytes (the separate database timeout fix remains uncommitted), runner configuration and provider configuration hashes. This is evidence for the isolated working tree, not a claim that every observed behavior comes from the focused commit alone.

Iteration 2 remains pending. Fresh waiting-state and same-incident resume acceptance failed/unverified; current-code fresh disproved acceptance was not established. The previous targeted delay live check and production build passed. No merge or deployment occurred.

## Attachment warning and fresh clone

The warning originates at attachments.ts attachmentPath(): join(attachmentsDir, relative) is dynamic, so Next's static tracer warns that it may scan the project. It is a build tracing/packaging warning, not evidence that attachment bytes or runtime path validation are broken. The manifest defaults to ../attachments relative to starter. That full directory is present in Git.

A clean git archive of HEAD's attachments directory contained all 58 manifest-referenced files, with every SHA-256 matching; check_packet.py also passed (100 orders, 4366 records, 58 attachments). The existing attachment route's build trace listed 344 files but no attachment manifest or binary samples. Therefore a full source checkout contains the needed files, while copying only .next output does not establish that external attachment files are packaged.

Fresh-clone access additionally requires the documented database and S3-compatible store setup and attachments:seed; the API signs object-store URLs rather than serving attachmentPath bytes directly. Correctly seeded full-checkout operation is not blocked by this warning alone. End-to-end downloads from a freshly provisioned object store were not tested: the isolated incident environment has no S3 configuration. Do not claim that test passed. No attachment code or storage was changed.

For a separate fresh clone, follow README's compose/database/attachment seed setup and then run APP_URL=http://localhost:3000 npm run attachments:smoke. Do not run db:seed against this existing isolated validation database: it replaces source tables.

## Exact safe demo instructions in the existing worktree

No live allowance remains. Use the recorded real-provider incident for evidence/execution replay, or create a clearly labelled mock proposal for another hands-on approval. Do not click Run/Resume real investigation or Ask the agent with provider credentials enabled.

From the existing worktree root, start only the isolated app (not the overnight runner):

```sh
cd /home/matrix/home/projects/car-delivery-control-room-agent-validation
python3 -c 'import sys,subprocess; from runner.control import clean_env; sys.exit(subprocess.call(sys.argv[1:],cwd="starter",env=clean_env()))' node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3107
```

This uses the existing isolated DB/operator environment, excludes provider keys and uses port 3107. If the port is occupied, inspect ownership rather than stopping an unknown app.

Open http://127.0.0.1:3107/incidents/7e733c30-7952-4bc7-84f2-e38a86dd5afa . Inspect Sources and evidence, Version 1, Latest decision and Simulated booking change completed. That real-provider case has already been approved/executed once and cannot demonstrate a new approval.

For a new **mock-only** hands-on proposal, open a second terminal in the same worktree and run:

```sh
python3 -c 'import sys,subprocess; from runner.control import clean_env; sys.exit(subprocess.call(sys.argv[1:],cwd="starter",env=clean_env()))' node --import tsx scripts/fresh-demo-incident.ts
```

Open the URL it prints. This creates a new mock replay without resetting history or using a model. Expand the cited reservation, alternative quote and driver report. Unlock decisions using the private INCIDENT_OPERATOR_TOKEN in the isolated runtime.env (never copy it into Git). Click Approve version 1; confirm the page says no change has been applied. Then separately click Apply approved simulated change. Reload and confirm one result and no Apply button. Stop the app with Ctrl+C when finished.

Do not offer the failed no-response incident as a working waiting/resume demo. Its failure is viewable at /incidents/1162123c-c739-43fa-b5db-6d6feab253f8.

## Final budgets and state

Runner/controller/app stopped. Tasks: iteration2 pending (2 attempts), iteration3 pending (1), iteration5 pending (0), optional iteration4 deferred. Recorded cycles 3/8; active seconds 272.76/14400 (14127.24 remaining); coding sessions 1/4 but token ceiling exhausted at 749646/200000; provider requests 18/18 and live runs 3/3. No counters were reset and no limits increased.
