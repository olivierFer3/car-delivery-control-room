# Iteration 2: real ferry investigation with protected execution

The real ferry agent is accessible at `/incidents?view=workspace`. Unlock operator access, choose Groq or Gemini and a fictional driver scenario, open the incident and click **Run real investigation**. The original mock demo and Python dataset/evaluation agent remain available separately. A real-agent incident cannot invoke `mock_proposal`.

## What was reused

The TypeScript incident engine, Postgres JSONB overlay, source order loader, fictional ferry quotes, proposal versions, human decisions, row locks, duplicate-safe simulated execution and existing Person A proposal/receipt UI are retained. The existing Python runner is not rewritten. The new Groq adapter joins the existing provider interface; Gemini uses the same loop and tools. No routing expansion or silent cross-provider fallback is enabled in this path.

Person A integration/handoff is documented in `ITERATION-2-CONTRACT.md`: the existing layout stays intact, new controls live in `live-agent-controls.tsx`, and the shared contract gains additive fields. No claim of separate human review is implied by this handoff.

## Real loop and factual boundaries

`providers.ts` asks the configured model to choose one JSON tool invocation. `engine.ts:runAgent` records the choice, executes a server-validated tool, checkpoints its result, and invokes the model again with recorded results. The model can choose context reads, driver outreach, booking/option checks, quote search, historical search, proposal, justified retention or waiting. There is no scripted production chooser. Automated tests deliberately use a labelled test double.

The scenario name is excluded from the model input. It controls only the fictional driver service response: late ETA 13:00 UTC, safe early ETA 10:00 UTC, or no reply. The booking cutoff is sourced from the snapshot (12:00 UTC). All business timing uses the snapshot clock `2026-10-21T09:00:00Z`. Wall-clock timestamps serve only runtime leases and provider diagnostics.

Ferry options are authored simulated service responses in `fixtures.ts`, not live transport inventory. Driver reports are attributed simulation evidence, never gate/boarding confirmation. The deterministic checks validate boarding timing, safety and blockers; quotes do not guarantee real capacity, and downstream delivery feasibility still needs operator review. A resolved incident never proves delivery.

`check_booking_constraints` verifies the original reservation against the current reply. Early retention requires a successful check, driver safety, no blockers and no unresolved information. A late proposal requires a checked original booking risk and a feasible alternative with source references. The server populates exact action amounts, currency and schedule from its own option records.

`receive_driver_reply` records an explicit fictional service event after silence. It does not invent a reply or resend the old question. Resuming uses the persisted history and current reply source ID. Checks must reference that current reply.

Operator conversation uses the same real provider in a read-only explanation mode. It may cite only recorded evidence IDs; it cannot change proposal, approval or execution. An alternative request identifies the old version as historical, exposes the current request and excluded option, and requires a different checked option and fresh proposal version. Failed tool feedback is retained in the next model input so the model can correct its request.

## Persistence and limits

`modelTurns` preserves provider/model, returned model/version and response ID when available, endpoint, selected tool/arguments, result or error, purpose and timestamp. Tasks, attributed sources, conversations, stop reason, human decisions and execution receipts remain in the incident. No private chain-of-thought is requested or stored. Groq reasoning output is disabled; Gemini thought parts are excluded.

An incident lease prevents concurrent agent requests. Model choices and completed results checkpoint separately, outside long-held database transactions. Fenced writes reject an expired worker after another run takes ownership. Existing business writes remain serialized by row locks. Approval applies to the current saved version only; execution is a separate command and duplicate calls return the same receipt. No real service is contacted by the booking executor.

The loop allows 10 iterations, up to two provider attempts per iteration, at most three tool-validation corrections and a 90-second abort budget; each provider request has a 25-second timeout. Rate-limit retry hints are honored up to the remaining budget (capped at 60 seconds). The lease is 110 seconds. Provider errors remain technical and visible. After a bounded failure, an explicit new run resumes saved facts rather than substituting mock reasoning. Database/process-level hard-termination recovery has not been exhaustively fault-injected.

## Private configuration and launch

From `starter`, retain the existing seeded database and private `.env`. Do not reseed or delete audit history to run iteration 2.

```env
GROQ_API_KEY=your_private_groq_key
GROQ_MODEL=openai/gpt-oss-120b
GROQ_ALLOWED_MODELS=openai/gpt-oss-120b
GEMINI_API_KEY=your_private_gemini_key
GEMINI_MODEL=gemini-3.5-flash-lite
GEMINI_ALLOWED_MODELS=gemini-3.5-flash-lite
INCIDENT_OPERATOR_TOKEN=your_private_operator_token
```

The keys are separate: Groq is not xAI Grok. Both models were verified against official documentation and the authenticated model catalogs. The older documented Groq default returned 404 in this account; the old Gemini default also returned 404, and another Gemini model returned 503/timeouts. Those failed attempts remain in history. Model changes were explicit server configuration changes, never an automatic permission or provider change.

```sh
cd /home/matrix/home/projects/car-delivery-control-room/starter
npm ci
npm run incidents:init
npm run dev -- --port 3001
```

Open `http://127.0.0.1:3001/incidents?view=workspace`. Enter the local operator token in the password field; never paste it into chat or commit `.env`. Provider presence/model configuration is visible under secondary diagnostics. No provider key is sent to the browser.

## Commands and verification

```sh
npm run test:incidents
npm run test:dataset
npm run test:iteration2
npm run typecheck
npm run build

# Real provider calls, local Postgres, and explicit fictional test approvals:
npm run verify:iteration2
npm run verify:iteration2 -- --gemini --early-only

# Inspect model identifiers available to the private keys:
npm run verify:iteration2 -- --check-models

# Resume an unfinished verification case after a visible transient failure:
npm run verify:iteration2 -- --resume INCIDENT_ID
```

The verification script labels real calls, preserves previous histories, compares the source order before/after, and saves `docs/verification/iteration2-live-*.json`. Its explicit client-side rate-limit retry is capped at two retries separated by 30 seconds; it does not erase failed attempts. Server request limits still apply independently.

Browser check, after starting the app and generating live verification evidence:

```sh
npm run smoke:iteration2
```

It requires Playwright (or `PLAYWRIGHT_MODULE` and optional `CHROME_PATH` pointing to installed tools). It checks actual persisted model evidence and the execution receipt, provider/scenario controls, locked/unlocked operator boundaries, mobile overflow and existing histories. It does not make additional model calls.

## Verification status

Actual live acceptance checks passed with Groq: late driver -> checked proposal -> read-only model explanation -> different option/version 2 -> stale/unapproved rejection -> explicit test approval -> one receipt under concurrent duplicate execution; early/safe driver -> retained booking, no human decision; silent driver -> persisted waiting -> explicit fictional reply -> resumed retained-booking conclusion, with exactly one driver question. Both the original source order and six previous incident histories were unchanged. Rate-limit and validation failures remain visible in the same histories.

Gemini (`gemini-3.5-flash-lite`) separately passed the early-arrival case using real model-selected context, driver and booking-check tools, followed by justified retention. No mock reasoning was used in either live verification.

Automated checks: 15 existing incident tests, nine dataset tests and ten iteration-2 tests (34 named tests), TypeScript and production build. The build retains the pre-existing attachment tracing warning. Browser verification passed: actual Gemini model evidence and actual Groq execution receipt, no mock controls in real incidents, locked/unlocked operator access, provider/scenario creation, mobile layout without overflow, no browser page errors and unchanged existing incident histories. A fresh Gemini/no-response case was created without launching any model calls. No process-crash fault-injection or real-world service integration is claimed.
