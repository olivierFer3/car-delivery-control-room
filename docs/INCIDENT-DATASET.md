# Incident dataset dashboard

Open `http://127.0.0.1:3001/incidents` in the current local environment. The default Incidents view now reads the four problem datasets directly, without reseeding Postgres or replacing existing incident histories:

| Source | Records | Meaning |
| --- | ---: | --- |
| `agent/problems/data/problems.jsonl` | 74 | Grouped Bahn snapshot problems: 37 open, 37 resolved |
| `test_cases.jsonl` | 31 | Hand-written evaluation scenarios |
| `test_cases_generated.jsonl` | 22 | Model-generated evaluation scenarios |
| `test_cases_synthetic.jsonl` | 3850 | Deterministic variants of 77 problem types |

Counts derive from the files; the numbers above were verified on 2026-10-24. Search covers IDs, orders, vehicles, summaries, owners, waiting parties and messages. Filters cover dataset, status, domain, problem type, severity and recorded solution state. Results have 30 cards per page, stable ordering and shareable filter URLs. Files are reloaded when their modification time or size changes. An optional missing test file is omitted; invalid primary data produces an explicit error. `PROBLEMS_DIR` can point to another compatible directory; validate files with `agent/problems/validate.py`.

Each detail page at `/incidents/catalog/:id` preserves original problem status, ownership, timestamps, source grouping, messages and their visibility/language, next steps, proposal payloads, human decisions, resolution and solution sources. Source records resolve back to the original JSONL files; unavailable records are labelled as missing. Only Bahn orders link to existing order pages. Unlinked support cases retain their missing order link; test orders are not silently linked to unrelated snapshot orders.

Expected answers and simulator personas are collapsed evaluation references. A scenario is not classified as open or resolved. An expected solution is never presented as an action performed. Historical decisions do not authorize a new action.

## Investigation and operator review

The dashboard reuses the existing Python `case_agent.py` through `dashboard_runner.py`. The server passes the current case's facts, messages, simulation time and simulator personas; it excludes the reference solution, expected handoff/checks and judge scores. Snapshot cases use attributed source records and historical driver/site statements; unknown locations and replies remain unknown. The bridge does not invent a current driver position.

Configure `GROQ_API_KEY` privately in `starter/.env` and restart the app, or use the existing ignored `groq_api_key.txt` convention at the repository root. No key is included in browser bundles or API responses. The UI displays an unconfigured-agent state and disables launching until a local credential exists. Actual provider access can still fail; such a failure stays technical, never a business conclusion.

Unlock with the existing operator password field and `INCIDENT_OPERATOR_TOKEN`. Starting a case invokes the real model loop; no model call occurs simply by browsing. One investigation per case can be active at a time. The wrapper limits the process to 120 seconds, 10 agent iterations and two provider retry attempts per request; it kills the child on timeout. Running status is saved before the child starts. Interrupted runs are shown as technical failures after 125 seconds, and resuming starts a separate investigation. Simulated tools have no real-world side effects.

`control_room_dataset_runs` is a separate Postgres table. Every new investigation has its own immutable recommendation, tool results and run ID. Operator approval, rejection or alternative requests are saved against that specific run; duplicate reviews and reviews of failed or prohibited-action runs are rejected under a row lock. A request for an alternative is passed as context to the next investigation; it does not authorize action. The recent-investigations section shows pending decisions and failures.

Approval records review of a recommendation. Generic booking/payment/customer actions are **not executed** by this dataset integration; applying them remains a separate human task. The original ferry mock workflow retains its approval-then-simulated-execution path at `/incidents?view=workspace`, and old detail URLs still work. No existing incident record was reset or deleted.

## APIs and affected files

- `GET /api/incident-dataset?dataset=bahn&q=...&status=open&domain=on_the_road&type=VEHICLE_WARNING&severity=critical&solution=planned&page=1`
- `GET /api/incident-dataset/:id`: full problem, resolved sources, saved evaluations, local investigation history and agent configuration flag.
- Operator-protected Server Actions launch investigations and record decisions. No extra unauthenticated write endpoint was added.

Person A/UI scope: `app/incidents/dataset-dashboard.tsx`, `dataset-incident.tsx`, new catalog route, page selector, scoped styles and original demo navigation. The user explicitly requested the dataset integration in the dashboard. Existing pages were preserved as `demo-dashboard.tsx`.

Person B/backend scope: `lib/incidents/dataset*.ts`, dataset API routes, `dataset-actions.ts`, Python bridge and verification scripts. Shared types are in `dataset-contracts.ts`. Existing Python agent and source datasets were not rewritten.

## Verification actually performed

- All four files pass the repository's schema validator: 3977 records, no errors.
- `npm run test:dataset`: nine named tests covering counts, combined filters, full synthetic pagination with no omissions/duplicates, test reference separation, source resolution, saved evaluations, expected-answer exclusion, exact-run/duplicate/blocked reviews and malformed model output.
- `npm run test:incidents`: existing 15 named tests still pass.
- `npm run typecheck`: passes.
- `npm run build`: passes; the pre-existing attachment tracing warning remains.
- Browser + Next.js + Postgres: dataset counts, pagination, search, source/scenario distinctions, detail navigation, source-order links, 390px layout with no horizontal overflow, no uncaught browser errors, old incident API histories unchanged.
- One selected-case launch was attempted. Groq has no configured key in this environment; the attempt persisted a technical failure with zero model/tool steps and no decisions. This is **not** a successful live-agent demonstration. The UI now explains and disables launching in this state.

Browser check: `npm run smoke:dataset` with Playwright installed or `PLAYWRIGHT_MODULE` and optional `CHROME_PATH` pointing to environment tools. `DATASET_LIVE_AGENT=1` additionally launches exactly one selected scenario only when a local key is configured. It never automatically approves or executes a recommendation. Screenshots are in `docs/verification/dataset-*.png`.
