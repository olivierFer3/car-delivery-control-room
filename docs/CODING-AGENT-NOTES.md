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
