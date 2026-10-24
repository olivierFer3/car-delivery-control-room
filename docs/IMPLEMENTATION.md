# Incident workflow handoff

## Existing work and current gaps

The starter is Next.js 16 / React / TypeScript with Postgres and Drizzle. Its order board, order detail, inbox and entity pages read the synthetic snapshot. Existing uncommitted incident work adds a separate Postgres JSONB overlay, incident endpoints, shared types, simulated tools, Gemini supervisor loop, approval checks and mock scenarios. This work is preserved.

The smallest workflow is implemented in backend code: open incident → mock proposal → approve exact version → simulated execution receipt. The generated example exercises CD-420603 (`ord-00603`) and its alert `alert-x5259ff7f2e03f0e6`, with explicitly fictional additional quotes. No source booking or order status is mutated. Iteration 1 now has a connected operator interface at `/incidents`, coordinated with Person A. The real browser/Postgres flow has passed open → mock proposal → reject → revised proposal → approve → execute → reload. Live model verification remains outside iteration 1. See `ITERATION-1.md` for current setup and evidence.

## Ownership and shared contract

| Owner | Files | Responsibility |
| --- | --- | --- |
| Person A | `starter/app/page.tsx`, pages, components, CSS | Decision queue, investigation/waiting list, incident details, evidence and timeline, approve/reject/alternative buttons, chat, loading/error/empty states, user validation |
| Person B | `starter/lib/incidents/{engine,store,providers,fixtures,mock,http}.ts`, `starter/app/api/incidents/**`, incident scripts/tests | Persistence, tools, agent, providers, security, recovery and backend checks |
| Shared | `starter/lib/incidents/contracts.ts`, `docs/examples/incident-responses.json`, this document, `.env.example`, package scripts | Review changes together; preserve existing fields; examples allow independent UI work |

The interface uses same-origin Server Actions and an HttpOnly signed eight-hour operator cookie. The operator enters the private token in a password field to unlock decisions; no credential is embedded in browser bundles or persisted to localStorage. Next.js Server Function argument logging is disabled. The current token is a demo authentication mechanism, not a production identity system. Read-only incident endpoints are local-demo endpoints.

## API v1

- `GET /api/incidents?q=...` returns `{ incidents, uncheckedOrders: "Not checked" }`. Filter `state === "needs_decision"` for the decision queue; `investigating` and `waiting` are separate lists. Absence of an incident is not a safety verdict.
- `POST /api/incidents` with `{ orderId, signalId, scenario }` creates one investigation per order/signal. Scenarios: `delay`, `disproved`, `no_response`, `contradiction`. Signal must belong to the order. Response: 201 with incident.
- `GET /api/incidents/:id` returns the incident without `technical`. Authenticated `?technical=1` provides the secondary diagnostic view.
- `POST /api/incidents/:id` accepts the `Command` union in `contracts.ts`. Write requests require `Authorization: Bearer <INCIDENT_OPERATOR_TOKEN>`.

Commands:

```json
{"command":"mock_proposal"}
{"command":"run"}
{"command":"decide","version":1,"choice":"approve","operator":"demo-operator","comment":"Reviewed the exact cost and schedule"}
{"command":"execute","version":1}
{"command":"decide","version":1,"choice":"reject","operator":"demo-operator","comment":"Too expensive"}
{"command":"decide","version":1,"choice":"alternative","operator":"demo-operator","comment":"Find another departure"}
{"command":"message","text":"Explain the remaining uncertainty"}
```

Responses expose `summary`, `evidence`, `missing`, `contradictions`, `tasks`, `nextStep`, `proposals`, `decisions`, `executions`, `conversation`, and `timeline`. Show latest proposal with its version, exact actions and consequences. Approval and execution are distinct operations. Errors use `{ error }`: 401 unauthorized, 400 malformed input, 409 invalid state/version, 503 storage or command failure; detail GET returns 404 when absent. Show technical_error as a failed investigation, never a missed-ferry conclusion.

States: `investigating → needs_decision → approved → resolved`; evidence gaps lead to `waiting`, provider/limit failures to `technical_error`. Rejection waits; requesting an alternative resumes investigation and requires a new approval. Execution repeats return the recorded receipt. A failed execution retains its decision and empty effects. Versioned proposals are append-only through the API. Row locks serialize mutations and atomically commit simulated effects and receipts.

Simulation time is always `2026-10-21T09:00:00Z`. A driver reply is an attributed simulated report. A feasible quote is not live capacity. Resolved means this incident ended; it never means the car arrived.

## Iterations

| Iteration | Tasks and owner | Files | Dependency | Observable acceptance |
| --- | --- | --- | --- | --- |
| 1 Integrated workflow | B: persist mock flow; A: decision list/detail and controls | incident API/store/mock, A pages, shared examples | seeded Postgres and private operator token | Create case, see proposal, approve version, execute once, see receipt; source order unchanged |
| 2 Real agent | B: Gemini chooses tools; A: show checks and conversation | providers/engine, A detail/chat | provider key and iteration 1 | Model reads context, asks driver, retrieves quotes, checks timing, proposes; no scripted chooser in live path |
| 3 Reliability | B: approval/version checks, idempotency, waiting/error states; A: retry and rejection states | engine/store/http/tests, A controls | iterations 1–2 | Unauthorized/stale/duplicate attempts checked; silence persists; provider failure remains technical |
| 4 Providers | B: Grok adapter, explicit routing and compatible fallback; A: secondary diagnostics | providers, env, tests | first provider verified live | Switch configured primary without loop rewrite; transient fallback retains tasks and does not resend driver question |
| 5 Memory | B: retrieve previous incidents; A: show reference labels | store/engine, A detail | stored incidents | Relevant cases returned with warning; current sources and new approval still required |
| 6 Delivery | A: finish states and demo/user validation; B: integration/concurrency checks and setup | A UI, scripts/tests, docs | preceding iterations | Reproducible demo, failure scenarios and documented limitations |

## Setup and demonstration

Use the existing starter setup in `starter/README.md` to seed the snapshot. Then from `starter`:

```sh
npm run incidents:init
npm run test:incidents
npm run typecheck
npm run incidents:examples
npm run dev
```

Set a private `INCIDENT_OPERATOR_TOKEN` in `.env`. Gemini uses `GEMINI_API_KEY`; Grok uses `XAI_API_KEY`. `AGENT_PROVIDER` selects `gemini` or `grok`; optional `AGENT_FALLBACK_PROVIDER` selects the other. Per-provider model and allowlist variables are in `.env.example`. Invalid configuration fails closed. Missing keys never silently select a mock agent. `mock_proposal` is explicitly the iteration-1 fixture.

Gemini defaults preserve the original `gemini-2.5-flash` setup. Official documentation currently limits 2.5 access for new projects; configure an accessible, officially verified model and its allowlist for the actual account. Grok defaults to `grok-4.7`. These adapters use JSON tool choices validated by the server, without enabling provider-hosted action tools. The loop permits 10 iterations, at most two providers per iteration, 25 seconds per provider request and a 90-second abort signal. Database query/lock duration and whole-request hard termination still need integration-level verification. Restart during a run rolls back its overlay transaction; current simulated effects have no external side effects.

Official references inspected on 2026-10-24:

- https://ai.google.dev/api/generate-content
- https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash
- https://docs.x.ai/developers/models
- https://docs.x.ai/developers/model-capabilities/text/generate-text

## Known limitations for the next backend increment

Driver responses are fixed scenario fixtures; a silent driver does not later answer automatically. Booking changes are recorded only as incident overlay receipts. There is no customer messaging or general date/cost mutation tool. Chat currently runs the investigation and requires a runnable state; conversational explanation while awaiting approval needs a separate read-only path. No background scheduler, streaming progress or model-selected delegation is implemented. Historical search currently covers participant-created overlay incidents, not the snapshot's historical incident collection. Live-model and process-crash recovery checks remain required. Iteration 1 HTTP/browser/Postgres checks, including concurrent duplicate execution, passed; see `ITERATION-1.md`. Do not describe mocked adapter tests as a live LLM demo.
