# Iteration 1: connected mock workflow

## Working now

Open `/incidents` from the new Incidents navigation entry. Unlock decisions with `INCIDENT_OPERATOR_TOKEN` from your private `starter/.env`, then open the ferry-delay demo for CD-420603.

1. Prepare the mock proposal. The incident shows the initial signal, sourced booked cutoff, simulated driver ETA, completed checks and evidence.
2. Review version, exact cost, departure, arrival, consequences and cited records.
3. Approve, reject, or request an alternative, optionally leaving a decision note.
4. Approval saves only the decision. Use **Apply approved simulated change** to execute that exact version.
5. Read the simulated receipt and timeline. Reload or reopen the incident to see the persisted result.

Rejected proposals cannot execute. Preparing another proposal increments its version and requires a new approval. Reopening the demo retains history rather than creating a duplicate. The source snapshot and delivery status stay unchanged. UI explicitly labels this as a mock investigation.

## Coordination and changed files

Person A implemented the new pages and scoped styles: `starter/app/incidents/page.tsx`, `starter/app/incidents/[id]/page.tsx`, `starter/app/incidents/incidents.module.css`. Person B supplied `actions.ts`, `operator-access.tsx`, `lib/incidents/operator-session.ts`, the shared `PublicIncident` type, the small AppFrame navigation/footer update, store repair and tests. Existing order pages/components were preserved. No provider features were added in this iteration.

Server Actions require an HttpOnly signed session cookie established by a token check; Next.js checks same-origin action requests. Sessions expire after eight hours and token rotation invalidates them. Browser source contains no configured credential; the password field is cleared after unlock. `logging.serverFunctions` is disabled because development action argument logging can reveal the token. API writes retain their existing Bearer-token checks. This is demo operator authentication with one shared operator identity, not a multi-user roles system.

## Local setup

Follow `starter/README.md` for the existing database setup and snapshot seed, then:

```sh
cd starter
# Set a private INCIDENT_OPERATOR_TOKEN in .env alongside DATABASE_URL.
npm run incidents:init
npm run dev
```

The initializer also repairs earlier double-encoded incident JSON while preserving history. Incident writes now use postgres-js JSON parameters for object-valued JSONB. This bug was detected through the browser and real Postgres, not by the in-memory tests.

The verified environment has a fresh `bahn-iteration1-db` Docker container, a seeded local database, and ignored `starter/.env` with a randomly generated private operator token. Docker Compose is absent here, so the local Postgres container was started directly. The app is running at `http://127.0.0.1:3001` because port 3000 was already occupied. No attachments store is required for this workflow.

The demonstrated incident is already resolved and remains available for review; opening the demo deliberately preserves it. For a fresh replay in the same database, run `npm run incidents:fresh-demo` from `starter`. It adds an explicitly isolated demo run for the same source alert, prepares version 1, and verifies earlier incident histories are unchanged. It never approves or executes the proposal. The command prints the new URL; set `APP_URL` if the local app uses another port. Normal demo reopening still retains its existing history.

## Verification actually performed

- Real browser + Next.js + Postgres: unlock failure/success; incident open; mock proposal; rejection; reload preserves rejection; version 2 proposal; approval; no execution until a separate click; simulated execution; reload preserves result; list/reopen retains one incident.
- Server boundaries: unauthenticated write returns 401; unapproved execution and stale approval return 409; two concurrent duplicate execution requests return the one saved receipt.
- Source order API response before/after is identical.
- Browser sees no uncaught page errors; 390px layout has no horizontal overflow.
- `npm run test:incidents`: 15 named tests pass, including session expiry/tampering/token rotation.
- `npm run typecheck`: passes.
- `npm run build`: passes with database environment configured. Existing attachment filesystem tracing warning remains.
- Screenshots: `verification/incident-proposal.png`, `incident-approved.png`, `incident-executed.png`, `incident-mobile.png`.

Browser smoke script: `starter/scripts/smoke-incident-ui.mjs`. It requires a fresh demo incident (or untouched created incident) and never deletes history. For a machine without Playwright, install the test tooling locally:

```sh
npm install --no-save --package-lock=false playwright@1.58.2
npx playwright install chromium
APP_URL=http://127.0.0.1:3000 npm run smoke:incident-ui
```

`PLAYWRIGHT_MODULE` and `CHROME_PATH` can point to environment-provided Playwright and Chrome. The verification here used the installed environment tools rather than adding an application dependency.

## What remains

Iteration 1's requested open/review/approve-or-reject/execute/result path works. This is a single seeded ferry scenario with a mock proposal, not live LLM verification. It has no automatic fresh-demo reset, multi-user identity/roles, deployment setup, or action failures triggered from the UI. Those are outside this minimal flow. Further incident types and real-agent conversation should build on the existing contracts in subsequent iterations. Operator user testing with the actual team remains to be done.

## Unlock decisions locally

Open the ignored private `starter/.env` locally and copy the value of `INCIDENT_OPERATOR_TOKEN` into the **Operator token** password field on the incident page, then click **Unlock decisions**. Do not paste the value into chat or commit it. The configured value is already present in this environment; no rotation is needed. Unlocking creates a signed HttpOnly session for eight hours. If you change the environment token, restart the app and unlock again.

Fresh-demo replays use an optional `demoRunId` to separate their audit histories while keeping the original dataset alert reference. A unique index covers order, signal and demo run; ordinary incidents continue to have one history per signal.
