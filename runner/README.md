# Bounded overnight validation runner

This runner is local to the `agent/overnight-validation` worktree. It never merges, pushes, deploys, resets or stashes. The source/main checkout and its database are not workspaces for coding or tests. A human must review its small commits before any merge.

The controller is Python stdlib + SQLite, reusing Node/Next/Postgres and the existing regression tests. One `flock` protects all controller namespaces; one Codex CLI session runs at a time. Codex uses `--approve-for-me`, its normal workspace-write sandbox and normal approval review. No dangerous approval/sandbox bypass flags or alternate accounts are used. Permission/account failures stop the task visibly.

## Isolation and baseline

- Source: `/home/matrix/home/projects/car-delivery-control-room`, clean baseline `ab2e042`.
- Worktree: `/home/matrix/home/projects/car-delivery-control-room-agent-validation`.
- Branch: `agent/overnight-validation`.
- Dedicated labelled container: `bahn-overnight-validation-db`.
- Dedicated database: `controlroom_overnight_validation`, role `overnight`, loopback port **15438**.
- Separate application: `http://127.0.0.1:3107`.
- Controller state/logs/private config: `~/.local/state/car-delivery-overnight-validation/`, outside the coding worktree. The isolated `starter/.env` is ignored and contains only generated test DB/operator credentials, never the source database URL.

Database identity, branch, worktree and app port are checked before execution. The controller refuses shared ports/database names, an unknown occupied application port or an unexpected container label/binding. `prepare` seeds only when the dedicated database has no orders table; it never reseeds a populated database on resume. Independent node_modules/.next caches are used; no symlink into the source checkout.

`config.json` holds reviewed limits; `queue.json` holds acceptance criteria. Existing legitimate tests, holdouts, datasets, manifests, controller and policy files are hash-frozen when a queue initializes. The coding worker cannot modify them. Failed/out-of-scope edits are preserved and block the run; nothing is auto-restored or erased. A dirty worktree not matching the controller's recorded owned edits also blocks resume.

## Queue and cycle

Order: iteration 2 verification → iteration 3 reliability → iteration 5 memory/demo readiness → optional iteration 4 compatibility. Optional routing is deferred by default. `NEXT-DAY-IDEAS.md` is a review-only document, not an implementation backlog for the worker.

Each cycle evaluates development regressions and a real isolated PostgreSQL/HTTP gate; diagnoses a demonstrated failure (or performs the one smoke review); launches at most one sequential coding session; guards the diff; reruns regressions; checks separately maintained held-out cases; checks the relevant live-verification requirement; builds; records a bounded-evidence receipt; and commits only verified scoped changes. Failed regressions preserve changes and may retry within limits. Held-out failures block for owner review and are not fed back into design prompts.

Iteration 3 includes a real database-contention check; iteration 5 requires source-labelled snapshot and participant memory. These are future tasks for the runner, not features claimed implemented by building it. Rule candidates become validated only after their scoped gates pass, with a receipt reference; rejected/conflicting rules retain counterexamples. Passing tests never proves there are no bugs.

The smoke profile has a separate SQLite queue. It runs one iteration-2 cycle with one actual Codex review, no speculative product changes and **zero business-provider API calls**. It does not start or advance the overnight queue. Existing real-provider artifacts are explicitly historical baseline evidence, not a new live run. After product changes, fresh provider verification is mandatory and cannot be replaced by scripted model fixtures. Exhausted allowances mark affected changes `not_live_verified` and block validation/commit, preserving changes for review.

## Exact commands

```sh
cd /home/matrix/home/projects/car-delivery-control-room-agent-validation

# Once; already prepared in this environment. Uses only the isolated DB.
python3 runner/control.py prepare
python3 runner/control.py self-test

# Initialize the persistent overnight queue, without running it.
python3 runner/control.py init

# Start the overnight controller in the background (not started for this task).
python3 runner/control.py start

# Inspect state, phase, budgets, task statuses, PID identities.
python3 runner/control.py status

# Request a stop; active owned process groups/app are terminated, edits retained.
python3 runner/control.py stop

# Resume in background; counters, elapsed time and completed tasks are retained.
python3 runner/control.py resume

# Foreground alternative; Ctrl+C/stop should be followed by status inspection.
python3 runner/control.py resume --foreground

# Short, separate smoke queue; not a full overnight run.
python3 runner/control.py smoke
python3 runner/control.py status --state smoke
python3 runner/control.py stop --state smoke
```

A completed smoke namespace is not automatically reset/replayed. All runtime state persists. Logs are under `state/`, `smoke/` or `probe/` within the external runtime directory. `state.sqlite` contains queue, events, budgets, stop flag and process records. `application.jsonl` and command JSONL files are redacted before writing. Reasoning events are omitted. Coding prompts contain only scoped tasks and sanitized development failures, not credentials or held-out cases.

## Defaults and credentials

| Limit | Default |
| --- | ---: |
| Cycles | 8 |
| Cumulative active elapsed time across resumes | 4 hours |
| Coding sessions | 4 |
| Coding-session wall time | 15 minutes |
| Reported coding-token ceiling | 200,000 |
| Task retries after initial attempt | 2 |
| Test/build command wall time | 180 seconds |
| Live verification attempts | **3 total** |
| Model requests per verification attempt (all providers/retries combined) | **6** |
| Business-provider requests overall | **18 maximum** |
| Provider output cap when explicitly enabled | 2,048 tokens/request |

A business request is reserved and counted **before** sending; retries also count. The live child has a process-local fetch wrapper plus persistent atomic request ledger. It accepts only model-provider hosts and refuses redirects/unexpected destinations. The coding worker and app process do not receive business-provider keys. Only the specific live-verification Node child receives imported keys; the legacy Python provider path is not run by this controller.

Existing Groq/Gemini credentials and provider/model settings have been privately imported from the source `.env` into mode-0600 external `provider.env`. Database settings and operator credentials are never copied. `AGENT_PROVIDER` is respected; when absent the existing adapter defaults to Gemini (currently `gemini-3.5-flash-lite`). No fresh provider request was sent during this configuration change.

Each live verification attempt investigates **one incident**, scheduled delay → disproved → no_response across at most three attempts. The last scenario includes waiting and an explicit simulated reply/resume, all within its same six-request allowance. These are scoped checks, not three complete suites. The LLM chooses its tools; no step is filled in with mock reasoning to fit the cap. Extra tool choices, retries, failed requests, and any future fallback requests consume the same per-run and global request allowance. If six calls cannot establish the outcome, verification fails visibly. Current service does not enable fallback; no routing feature was added.

`state/api-budget.json` retains attempted runs and both counters across resume; failed/interrupted attempts consume a run and all requests already reserved. Requests are counted before transport. Each model request is capped at 2,048 output tokens; input JSON is capped at 48,000 characters. Only the controlled live child receives keys. The application/coding worker receive none. `live-verification-status.json` records the affected HEAD/dirty-file hashes and verification result. Budget exhaustion means `not_live_verified`, never a pass. Optional iteration 4 stays deferred.

The 8-cycle and 4-hour limits cover the whole queue across resumes, not each iteration. A cycle is one evaluation/fix/regression attempt; it may need no coding session. At most four coding sessions may run, each at most 15 minutes: at most one hour of coding-session wall time, within the four-hour total. Tests, builds, app startup and live verification also use total elapsed time. Each task gets at most an initial attempt plus two retries, additionally constrained by the eight-cycle cap. Whichever limit is reached first stops/blocks progress. Ordinary commands/live verification have their own 180-second bound.

Codex uses the existing local CLI account authentication. Session attempts and duration are hard-bounded. Reported input tokens include cached input tokens; cached tokens are not added a second time. The controller conservatively sums reported input, output and separate reasoning usage fields. Token usage is reported by Codex **after a turn**, so the reported-token ceiling prevents starting further sessions after the ceiling is reached; it is not a strict pre-inference token or dollar cap, and one turn can overshoot it. Interrupted sessions with unknown usage require review before another coding session. No account limit is bypassed.

## Supported-tooling evidence and limitations

The installed Codex CLI supports non-interactive JSON events, workspace-write sandboxing and approval review. A real read-only probe succeeded. The outer managed environment initially blocked session-store initialization; the supported invocation succeeded after normal execution approval. Launch this controller through the terminal's normal approval path if its environment blocks Docker, local ports or CLI session storage. It must report blocked rather than rerun with sandbox/approval bypass flags.

Official documentation inspected: [non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode), [approvals and sandboxing](https://learn.chatgpt.com/docs/agent-approvals-security). The runner does not provide a hostile-code security boundary or a billing guarantee. It combines supported sandbox/review controls, isolated credentials/resources, immutable evaluation gates, scoped diffs and explicit limits.

The app is stopped when each controller invocation exits. The dedicated database container is retained for resume. No full overnight run has been started as part of setup. See `runner/evidence/` for actual smoke/test/isolation results; do not confuse mocked transport/process tests with live model-provider verification.

## Verified setup on 2026-10-24

One actual smoke cycle completed in 54.98 seconds (`b99b75f`), with one real Codex CLI review, the original 34 regression checks, typecheck, isolated PostgreSQL/HTTP gate, separate held-out fixtures and production build. The controller stopped its application afterward. No fresh Groq/Gemini requests were made. The source checkout remained clean at `ab2e042`; before/after order and incident-history hashes matched. Thirteen controller tests passed, including real controlled-process stop/restart and persistent counters; these are not live business-model tests.

The smoke reported 250,755 coding tokens including cached input, exceeding the 200,000 post-turn ceiling in one session. No second session was launched. This observed overshoot illustrates why that setting is not a hard billing cap. After smoke, a controller review added discovery/freezing of new regression tests and stage-failure handling; controller tests were rerun. No second smoke or overnight run was started. Detailed receipts: `runner/evidence/setup-verification.json`, `runner/evidence/smoke-iteration2-cycle-1.json`, and `runner/evidence/smoke-review.md`.
