# Synthetic delivery operations

The supported workflow is a future booked-ferry connection risk, across the supplied orders rather than one demo ID. `/incidents/orders` lists all 100 supplied orders and their source timestamps. Six currently qualify: CD-420075, CD-420324, CD-420439, CD-420442, CD-420584 and CD-420603. Eligibility is calculated from the fixed `2026-10-21T09:00:00Z` snapshot, not today's date. A reservation can initiate a proactive connection review even when no alert exists. This does not invent an alert or assert a missed sailing.

Other sources are explicitly human-only: no future booked ferry, historical booking, ambiguous booking, unrelated/inactive alert or terminal order state. **Hand to human review** persists a waiting case, its source, rationale and history. Automated Run and mock reasoning are rejected for that case. It is not classified safe or resolved. This is a handoff queue, not a complete manual case-resolution system.

## Normal operation

1. Open `/incidents/orders`; filter by order reference, ID or state. Open the original order to inspect the snapshot. Select the precise initial alert or reservation. Unlock operator access using the private `INCIDENT_OPERATOR_TOKEN` from the server environment file, pasted into the password field. Never send it in chat or commit it.
2. Open investigation. The server validates membership and supported scope, and reopens the same operational case on repeated clicks. Earlier demos/history remain separate. A missing/invalid provider configuration produces an explicit error; it cannot select mock reasoning.
3. Run real investigation. The existing LLM loop chooses tools and receives their results. In operational cases `ask_driver` sends one fictional question and persists waiting until an explicit simulated reply arrives. No ETA is invented. Reload or restart retains tool results; an expired worker cannot overwrite a replacement lease.
4. Expand **Simulate a driver reply arriving**. Enter the actual simulated event's UTC ETA, safety, blockers and text. These fields do not contact a real driver. Exact duplicate event delivery is idempotent; conflicting replacement data is rejected. Resume explicitly. For a safe case use an ETA between snapshot time and that order's cutoff; for a late case use an ETA after its cutoff. The four unrelated order IDs are never substituted into a demo.
5. The model checks the original booking. A safe, unblocked connection may resolve without a proposal; this does not mean delivery. A late connection can yield a versioned proposal with simulated alternatives for the same order and assignment, source citations and consequences. A quote is not capacity or a booking.
6. Ask the agent to explain recorded evidence. This is read-only; a failed explanation never approves or changes a proposal. Reject leaves a waiting case; **Request alternative** supplies new instructions and requires a new proposal/version. Review evidence, cost and timing before approving that exact version. Approval and **Apply approved simulated change** are separate actions. Repeat execution returns the same receipt. The source snapshot is unchanged.

Technical failures remain technical_error with diagnostics, persisted results and an explicit retry. No failure resolves the business risk. An unexpired lease blocks concurrent runs; after a process failure it expires within 110 seconds. Reload then resume; do not create a new case to discard the history. There is no background worker/scheduler.

Coverage labels describe operational cases: **Not checked**, **Checked · no action needed**, pending investigation/decision, human review, technical review, and resolved incident with delivery tracked separately. Preserved one-off demo replays remain in the decision workspace; they are not automatically treated as operational checks on every order.

## Existing isolated worktree — no provider calls

The production build has been verified. Launch the normal application, not the overnight runner:

```sh
cd /home/matrix/home/projects/car-delivery-control-room-agent-validation/starter
env -u GEMINI_API_KEY -u GROQ_API_KEY -u XAI_API_KEY \
  node --env-file=/home/matrix/home/.local/state/car-delivery-overnight-validation/operational/app.env \
  node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3107
```

Open http://127.0.0.1:3107/incidents/orders and http://127.0.0.1:3107/incidents?view=workspace . Ctrl+C stops only this app. Port 3107 must be free; do not kill an unknown occupant. The private environment points at isolated PostgreSQL 15438 and attachment store 19009. It includes no model credentials. Existing real-run histories can be reviewed without spending requests:

- `/incidents/bb6235fc-5056-4d29-b89f-5f42521c0068`: recorded Gemini waiting/restart/late-reply investigation, proposal waiting for human review.
- `/incidents/7e733c30-7952-4bc7-84f2-e38a86dd5afa`: recorded Gemini delay investigation and separate approved simulated execution.

These are historical live traces on their fingerprinted code, not fresh live verification of the new selected-order path. Do not click real Run/Ask with live credentials unless a new allowance is authorized.

The automated-test database `controlroom_operational_test` is separate from the preserved incident history database. For inspecting its normal UI test cases, substitute private `operational/test-app.env` in the command. Those cases used **local provider test doubles**, not live Gemini. The test-only network-failure preload is not part of any normal launch command.

## Fresh checkout on another machine

Use the full repository, Node 24+, Python 3 (for the environment-file edit), Docker and a free application port. Docker Compose is optional: the tested setup below uses Docker CLI, since this environment has no Compose plugin. These names, volumes and loopback ports are separate from the shared development stack. Stop if a resource already exists; inspect it instead of deleting/reseeding it.

From `starter/`, create a NEW private environment file:

```sh
set -eu
test ! -e .env
cp .env.example .env
python3 - <<'PY'
from pathlib import Path
import secrets
p=Path('.env');s=p.read_text()
s=s.replace('localhost:5438/controlroom','127.0.0.1:15439/controlroom')
s=s.replace('http://127.0.0.1:9009','http://127.0.0.1:19019')
s=s.replace('INCIDENT_OPERATOR_TOKEN=\n','INCIDENT_OPERATOR_TOKEN='+secrets.token_hex(24)+'\n')
p.write_text(s);p.chmod(0o600)
PY
npm ci

docker run -d --name controlroom-fresh-db \
  -p 127.0.0.1:15439:5432 \
  -e POSTGRES_USER=controlroom -e POSTGRES_PASSWORD=controlroom -e POSTGRES_DB=controlroom \
  -v controlroom_fresh_pg:/var/lib/postgresql/data postgres:17-alpine

docker run -d --name controlroom-fresh-attachments \
  -p 127.0.0.1:19019:9000 -p 127.0.0.1:19020:9001 \
  -e RUSTFS_ACCESS_KEY=controlroom -e RUSTFS_SECRET_KEY=controlroom-local-only \
  -v controlroom_fresh_attachments:/data rustfs/rustfs:1.0.1 /data

# Wait until PostgreSQL reports accepting connections and the store returns HTTP 200.
docker exec controlroom-fresh-db pg_isready -U controlroom -d controlroom
curl --fail http://127.0.0.1:19019/health

npm run db:push
npm run db:seed
npm run incidents:init
npm run attachments:seed
npm run typecheck
npm run build
npm run start -- --hostname 127.0.0.1 --port 3108
```

Run `db:seed` only against that NEW dedicated database. It replaces source tables; it is not a normal restart command. Never run it against the shared development DB or an existing populated validation DB. Restart only the containers and app to retain case history. Local fictional DB/object-store example credentials above are not model keys; operator/model credentials remain in ignored `.env`.

In another terminal, from `starter/`:

```sh
APP_URL=http://127.0.0.1:3108 npm run attachments:smoke
APP_URL=http://127.0.0.1:3108 npm run smoke
```

`attachments:seed` checks all 58 source-file hashes before upload; `attachments:smoke` downloads one sample of each of the two formats via signed URLs and checks hashes. Signed URLs expire after 15 minutes; reload to refresh. Keep the repository's `attachments/` and manifest alongside `starter/`; copying only `.next/` is not a verified distribution. A known Next tracing warning remains. Real access through the local object store was verified; a literal fresh Git clone/full all-orders smoke on a different machine was not performed.

To enable normal real-agent operation later, privately set one provider key plus its model and allowlist in `.env`, restart the app and check **Model configuration**. The configured Gemini model is `gemini-3.5-flash-lite`; Groq is `openai/gpt-oss-120b`. Do not put keys into client code, Git or screenshots. No new live calls are currently authorized in the shared validation environment.

## Verification and remaining limits

Iteration 3 is accepted for baseline `f070bc3` through `runner/evidence/iteration3-reconciled-completion.json`, not by rerunning its gates. The operational extension is commit `91a128d`; it has automated/API/browser/persistence/build evidence but is **not live-verified**. No additional provider calls or runner sessions were used, and historical budgets/counters were preserved.

Tests cover the selected-order creation route and ordinary command handlers with real PostgreSQL across two processes: failed provider recovery, waiting, explicit/duplicate replies, early closure, late proposal, explanation, rejection/revision, stale approval rejection, separate approve/execute and concurrent duplicate receipt. Provider transport in those tests is a local double. The browser used the production app and real HTTP/PostgreSQL, including a separate test-only transport failure to verify the normal configured launch path without provider egress.

Minimum new live evidence for the extension: one non-demo late case, one verification attempt with up to six model requests total (read, ask, booking check, alternatives, option check, proposal), including all retries in that cap. To demonstrate live generalization on two cases, add a separate early case with up to four requests. These allowances are proposals only; none was added or spent. Extra model choices can exhaust either allowance and must remain visible as verification failure.

The application is operational within its supported synthetic ferry scope. It is not production dispatch: no real transport integrations, real driver events, general manual case closure, multiple operator identities or arbitrary incident automation. Historical memory/snapshot search is deferred because it does not unblock these operations. The dataset's four incident rows contain no resolved incident entries; none were fabricated. Optional iteration-4 routing remains deferred.
