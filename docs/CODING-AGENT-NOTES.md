# Coding agent evidence

## 2026-10-24

User prompt: build on the Bahn challenge repository, inspect first, preserve existing work, establish shared contracts and task ownership, then continue backend/agent implementation while leaving interface files to Person A. Requirements include genuine LLM tool choice, fictional services, fixed simulation clock, human approval per proposal version and duplicate prevention.

Observed pre-existing uncommitted work: incident contracts/engine/store/Gemini adapter/API routes/tests/scripts, package and environment changes, generated examples. No authorship of those earlier changes is claimed here. No interface files were changed in this pass.

Detected mistakes and corrections:

- TypeScript rejected the mock's waiting-state comparison after assigning investigating: changed the comparison to account for state mutation by the tool.
- The Node 26 test runner plus tsx reported one file as passing instead of the 11 named tests. Directly running the test module executes the named tests; package command updated accordingly.
- Provider failures previously all allowed fallback. Added retryable classification for HTTP 429/5xx; malformed tool output and permanent HTTP failures stop with a technical error.
- Constant-time token comparison used JavaScript character lengths before comparing UTF-8 buffers. Changed the length guard to byte lengths.
- One shell append used paths relative to the repository while executing from starter; both appends failed without changing files. Reissued from the repository root.

Rejected approaches: broad UI rewrite, treating alert status as verified delay, treating approval as execution, replacing the snapshot with booking effects, silently mocking missing credentials, and using historical resolutions as authorization.

Validation evidence is reported separately in the final handoff. Docker inspection was denied in the sandbox; the escalation request was interrupted. No database-backed or live-provider success is claimed. Adapter tests intercept fetch and use fictional keys. No people, transport providers or booking services were contacted.

Checks actually performed in this pass:

- `npm run test:incidents`: 14 named tests passed, including the eight requested scenario categories and mocked Gemini/Grok HTTP contracts.
- `npm run typecheck`: passed.
- `npm run incidents:examples`: generated pending/executed examples using the supplied CD-420603 records and explicitly fictional service quotes.
- `python3 check_packet.py`: passed, 100 orders / 4,366 records / 58 attachments.
- `git diff --check`: passed for tracked changes; incident files and docs were already untracked and remain uncommitted.
- `npm run build`: compilation and TypeScript passed; failed collecting page data for existing `/api/entities/[kind]`. Also warned about broad filesystem tracing in existing attachment code. No production-build success is claimed.

## Iteration 1 UI integration

User asked to focus on completing iteration 1 and explicitly coordinate interface changes with Person A. A delegated Person A implemented isolated incident pages/styles; the main agent implemented the authenticated Server Actions, shared type, navigation, store fix, and real-browser checks. No provider work was added.

Browser/Postgres integration uncovered a pre-existing persistence error: stringified JSON passed as a JSONB parameter was stored as a JSON string, causing the UI to navigate to `/incidents/undefined`. Corrected writes to use postgres-js JSON parameters and added a preserving repair in the initializer. The first smoke attempt failed; the next completed open/propose/reject/revise/approve/execute/reload with real persistence and concurrent duplicate requests.

Next.js development logging exposed the unlock Server Function argument in local logs. Disabled Server Function logging and rotated the local demo token before successful verification. One check was mistakenly invoked from the repository root where no package.json exists; reissued from starter. Docker Compose was unavailable; started a new local Postgres container directly with approval. Read access and socket/Chrome execution required sandbox escalation.

Actual validation: 15 unit/contract tests, TypeScript, production build, and a real Playwright browser flow passed. No live model was called. Screenshots and reproducible smoke steps are in ITERATION-1.md. Browser tests confirmed an unchanged source order, stale/unapproved/unauthenticated guards, one execution receipt under concurrent duplicate requests, persisted rejection and success, mobile layout, and reopening without a duplicate incident.

### Fresh iteration-1 replay (2026-10-24)

- User request: create a fresh demo incident without deleting existing history; provide its URL and local unlock instructions without disclosing the token.
- Kept the source alert and added an explicit `demoRunId` isolation key rather than resetting an existing incident. Updated the uniqueness index and normal reopen conflict target; no source dataset or UI files changed.
- Added `incidents:fresh-demo`: generates a version-1 mock proposal, inserts a new replay, and compares every prior incident body before/after. No approval or execution occurs.
- Actual creation confirmed one prior incident unchanged, with the new incident awaiting a human decision. Token value was never printed. Typecheck and all 15 existing named backend tests passed.

### New problem dataset integrated into Incidents (2026-10-24)

- Prompt: « on a un nouveau dataset d'incident … utilisable pleinement dans incidents le dashboard ».
- Inspected the new problem schema 1.1, builder/validation documentation, four datasets, existing Python agent and evaluation reports before implementation. Actual counts: 74 Bahn problems, 31 hand-written tests, 22 generated tests and 3850 variants.
- Preserved source files and old Postgres incident histories. Added a direct file-reading catalog, filters/pagination, complete sourced details, evaluation references and a separate persisted investigation/review workspace.
- Rejected treating `solution.status=expected` as a resolved incident or executable plan. Reference answers and expected checks are explicitly stripped from agent input; a regression test covers all scenario records.
- Preserved original Python agent; a thin bounded bridge reuses it. Review does not execute generic bookings, payments or customer messages. Prohibited tool attempts are blocked by the existing agent and make the new run unreviewable.
- Caught and fixed an incorrect working-directory prefix during file creation before verification. Typecheck initially detected the misplaced imports. No user files were removed.
- Initial browser launch used a Playwright browser revision not installed here; switched to the existing Chromium executable. Restricted browser launch required approved execution outside the sandbox.
- Browser check detected no configured Groq key. One attempted launch saved a technical failure with zero tool steps; did not describe it as a successful model run. Added an explicit configuration state and disabled launch until a local key exists.
- Validated all 3977 rows against the existing schema. Nine new named tests and 15 existing backend tests passed, along with TypeScript, production build and browser checks. The browser compares all pre-existing incident histories before/after and found them unchanged.

### First current-credential Groq audit (2026-10-24)

- User confirmed adding local API settings. Presence checks found both GROQ_API_KEY and GEMINI_API_KEY; values were never displayed. Gemini was not tested.
- Executed the same case_agent.run loop used by the dashboard, on test-0010, through a temporary transport observer which delegates to the real mvp.groq_request without replacing model responses or tool selection. No source code was changed for this audit. Reference answers remained excluded.
- Actual Groq requests selected and returned model openai/gpt-oss-120b. Successful supervisor calls chose get_case, then get_messages after receiving the case tool output, then ask_site and ask_driver. Their no-response results came from scenario fixtures with missing personas, not real contacts.
- Later requests encountered HTTP 400 and HTTP 429; the bounded run ended without a final recommendation. This verifies real model/tool/result/next-decision turns, not a successful end-to-end incident resolution. No approval or external action occurred.
- Evidence: docs/verification/live-groq-audit.json includes actual endpoints, response IDs, returned model IDs, tool-call IDs/arguments, tool outputs in subsequent requests, and error status codes. Credentials and HTTP authorization headers are excluded. The audit ran the Python loop directly; it was not persisted as a dashboard investigation.

### Iteration 2 implementation and real-provider verification (2026-10-24)

- User requested a real investigation through the existing approval/execution path, then explicitly asked to complete both Groq and Gemini connections. Inspected both agent paths before choosing the existing TypeScript approval engine for the ferry workflow; preserved the independent Python dataset agent and all earlier histories.
- Shared UI contract/handoff was written before interface edits. New controls are isolated in live-agent-controls.tsx; the existing proposal, approval and execution components were retained. No separate Person A approval is claimed.
- Added deterministic current-booking checks, explicit simulated reply intake/resume, read-only provider explanations, real Groq adapter, shared structured JSON tool contracts and checkpointed model turns with response/model IDs. Provider failure never selects mock reasoning.
- Detected a wrong working-directory prefix during an edit command; the command failed without changing the target. Re-ran the edit from the project root. TypeScript caught state-narrowing issues and they were corrected.
- Live catalogs authenticated both keys without displaying them. The documented llama-3.3-70b-versatile Groq model and the old Gemini default returned 404; selected account-listed models explicitly. Gemini 3.8 returned transient unavailability/timeouts; gemini-3.5-flash-lite produced real tool calls and a justified retained-booking conclusion.
- Groq rate limits repeatedly interrupted the live run. Choices/results were preserved, retries bounded, and explicit verification resumes reused prior driver outreach. No technical failure was reported as a business outcome.
- First alternative test incorrectly requested a cheaper sailing when the first chosen quote was already cheapest. Corrected the test to request a different feasible sailing, permitting higher cost with explanation. Earlier failed attempts and decisions remain in history.
- Live testing exposed an important context-filter mistake: excluding historical terminal tool results also hid validation errors from the next model decision. Fixed the filter to retain failed-tool feedback and added a regression test. Added explicit active alternative context, kept historical proposals separate from pending approval, and rejected waiting for approval without a new proposal. These are state/feedback corrections, not a scripted replacement for model tool selection.
- Groq real late-case verification passed proposal, source-backed explanation, version-2 alternative, stale/unapproved rejection, separate human test approval and concurrent duplicate-safe fictional execution. Gemini real early-case verification retained the original booking with no proposal/approval/execution. Remaining acceptance/browser results are recorded below when actually completed.

- All three Groq live acceptance cases subsequently passed, including persistent silence/resume with exactly one driver question. Six prior incident histories and the source order were compared before/after and remained unchanged. The late case intentionally retains all failed attempts and model/configuration changes as development evidence.

- Final browser verification passed real Gemini evidence, the actual Groq receipt, absence of mock controls, operator unlock, provider/scenario creation, 390px layout and unchanged existing histories, with no uncaught page errors. The first browser attempt timed out on an exact label match; made provider/scenario select IDs explicit and reran successfully. No additional model calls were made by the browser check.
- Final verified coverage: all three Groq acceptance scenarios and separate Gemini early-arrival verification, 34 named automated tests, TypeScript and build. Existing attachment tracing warning remains. No real communications or bookings occurred.

### Selected-order operations and evidence reconciliation (2026-10-25)

- User asked for iteration-3 evidence reconciliation while preserving counters, then clarified the goal as an operational synthetic application rather than a demo-only flow. Memory work was deferred; no providers/routing were added.
- Compared all 16 product files from Gemini recovery run 4; all matched. Provider/runtime hashes matched; current runner config matched run 5. Mapped recorded PostgreSQL/fault/approval gates to every iteration-3 criterion, backed up SQLite and recorded a completion receipt. No test/live replay, budget extension or task-attempt reset was used to close iteration 3.
- Inspection found real-agent creation hardcoded to ord-00603; five other eligible ferry orders existed without alerts. Added a normal selected-source creation path, current-booking eligibility, explicit human-only handoffs, source timestamps, stable reopen identity and explicit simulated replies. Retained the legacy demos and did not change the LLM chooser or approval/execution predicates. The user authorized the small UI/API connections; prior unrelated dirty runner files were preserved.
- An initial tool invocation used root-prefixed file paths from starter/ and created the new page in a nested starter directory. Typecheck exposed unresolved imports. Moved only that newly created file to its intended path, corrected a named import and verified typecheck; no pre-existing files were removed. A second incorrectly prefixed command made no edits and was corrected.
- New focused tests verify six eligible orders, historical/unrelated/ambiguous source handoff, order-scoped alternatives and evidence membership. A new disposable DB was created only on the isolated PostgreSQL server. Production API handlers were exercised across real application processes with local provider transport doubles: technical recovery, waiting/reply, early close, late proposal, read-only explanation, rejection/revision, stale approval, separate execution and duplicate prevention passed. No live model evidence is claimed for this change.
- Five regression files passed; typecheck and production build passed. Production-browser checks exercised normal order selection, missing configuration, human handoff, source citations, receipts/reload and a configured-launch failure with test-only preloaded provider transport. No provider network request was made. The preload is not part of the product or normal launch commands.
- Existing setup requires Docker Compose, but this environment lacks its plugin. Used standard Docker CLI with a separately labelled attachment store and volume instead. Seeded 58 hash-checked attachments and verified both download formats through signed HTTP URLs and the local store. The Next attachment tracing warning remains; a full standalone `.next` deployment was not verified.
- No overnight run or CLI coding worker was started for this direct implementation. Historical counters are unchanged. New selected-order behavior needs new explicitly authorized live evidence; minimum scoped late-case allowance is one run of up to six requests, with no allowance granted or spent here.

- The additional configured-launch browser test first waited for the wrong label, “Needs technical review”; the detail page uses “Technical review needed”. Corrected only the external test selector and reran that failed check, preserving the already-recorded failed transport history. No product predicate or legitimate test was weakened.

- The configured-launch test then read the API while the new asynchronous run was still investigating, although an old technical-error label was visible. Added bounded polling for a new completed model-turn record and released lease before asserting the same terminal technical_error condition. Only the failed test was retried; the final check passed with provider egress still replaced by a local 503 double.
