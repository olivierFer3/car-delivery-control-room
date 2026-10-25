# Iteration 5 handoff to Claude

Inspected 2026-10-25 after successful `git fetch origin`. This handoff involved Git/docs/source inspection only: no merge, checkout, cherry-pick, product edit, test suite, provider call or runner-state mutation. This documentation-only handoff is being published with the voice branch by explicit owner request; product code is unchanged.

## Git truth and recommended baseline

Repository: `https://github.com/olivierFer3/car-delivery-control-room.git` (`origin`). Local refs are not all at the fetched remote tips.

| Ref | Exact tip | Meaning |
| --- | --- | --- |
| local `main` | `ab2e0424af4e647fe6b4fa38fab38592b19ccc7d` | Occupied clean worktree; behind origin/main by one commit. |
| `origin/main` | `5090d252e3ee290d85e9e57aef7e2d214956ecff` | Canonical published main: original agent/dataset/approval app plus Python triage metrics, live-evaluation page and Gemini helper pool. |
| `origin/agent-evaluation` | `ad8b11554e913b8a24a1d9fba35d09366879efc7` | **Already integrated**: exact commit is an ancestor of origin/main. Linear ancestry is sufficient proof; no squash inference or reapplication needed. |
| `origin/agent/fast-eval-rules` | `63d14dae8c8412bc6136307f16d5fcf0bf39872b` | Latest combined operational + evaluation baseline by ancestry; not newly runtime-verified here. No local branch/worktree for this ref. |
| local + `origin/agent/overnight-validation` | `43f39bd55d631e698db4f265b7a60207a13753f5` | Published operational/reliability/fresh-clone evidence. Upstream set. Not in origin/main, but already in fast-eval-rules. |
| local `feature/simulated-driver-voice` | `73b08e2900548c3c5cef2b26fcbe8fe0e17cf242` | Product tip: four voice commits on 43f39bd; a later documentation-only commit publishes this handoff. Publication to origin/feature/simulated-driver-voice is owner-authorized. Recheck remote tip. This product tip lacks newer Python evaluation changes. |

**Coordination update:** the owner reports Claude is publishing a newer `agent/fast-eval-rules` baseline. The latest fetch for this publication still resolved that ref to `63d14dae8c8412bc6136307f16d5fcf0bf39872b`; this can change immediately. **Re-fetch and recheck its tip and ancestry before integration. Treat 63d14da below as historical inspection evidence, not a target to reset or downgrade Claude to.**

**No single inspected ref contains everything.** Recommended assembly base is Claude’s latest reviewed `origin/agent/fast-eval-rules` after that recheck, then integrate the voice branch once. This is an implementation baseline, not proof that the combined tree passes acceptance. Do not overwrite occupied worktrees or blindly pull/reset local main.

Actual merge `ca7aacc4e597d73bf2710262d28f3b7e20aae594` has parents **5090d25 + 43f39bd**. Despite its message “Merge agent/overnight-validation into main”, it is currently reachable from fast-eval-rules, **not fetched origin/main**. Its child 63d14da adds the fast/safety-net/learned-rules work. Do not replay overnight's 12 commits on top of that merge.

Necessary voice-only commits, in order:

1. `e471d42939752ae4c2cd132ef387af5f7c8e25a4` — additive contract, documented before implementation.
2. `cd1ed1c2f2ed83c3825d8dd0c0d9e6a4131f6f1e` — official SDK dependency/lockfile, signed-URL adapter, persisted voice sessions, atomic confirmation and server tests.
3. `c3e33d6af666ab35739273f1efb99c535c08f7fa` — browser lifecycle/review/resume, cookie-origin fix and regression, fixtures/client tests.
4. `73b08e2900548c3c5cef2b26fcbe8fe0e17cf242` — private configuration, agent prompt and honest verification notes.

**Conflict assessment:** changed-path intersection between `(43f39bd..63d14da)` and `(43f39bd..73b08e2)` is empty. Textual conflicts are therefore unlikely, not guaranteed absent; no trial merge was performed. Python evaluation changes still need a compatibility check with the Next dataset bridge. Preserve the voice lockfile dependency, newer `.gitignore` key exclusions, all evidence and approval checks. Docs/manual runner edits may conflict if someone independently replays them.

## Worktrees, local-only work and isolation

All paths below are under `/home/matrix/home/projects/`:

| Directory | Ref / state | Resources |
| --- | --- | --- |
| `car-delivery-control-room` | local main ab2e042; clean | Shared development DB 5438; do not reseed or modify. |
| `car-delivery-control-room-agent-validation` | overnight 43f39bd; **four dirty files** | App 3107, dedicated DB 15438. |
| `car-delivery-control-room-driver-voice` | voice 73b08e2; clean before this new handoff | App 3110, own `controlroom_driver_voice` DB 15440, container `bahn-driver-voice-db`, volume `bahn_driver_voice_pg`. |
| `car-delivery-control-room-fresh-validation-20261025` | independent literal clone, d23341d; clean | Not a registered worktree. App 3108, DB 15439, attachment store 19019. |

Preserve overnight's uncommitted `runner/README.md`, `runner/config.json`, `runner/control.py`, `runner/tests/test_control.py`. They include later reviewed orchestration/budget changes **not present in the pushed 43f39bd tree**. A task-only delta is documented in `docs/verification/run6-authorized-budget.patch`; it is not a complete replacement for those dirty files. Do not reset, stash, stage wholesale or assume a fresh clone contains them. Voice branch and this handoff are now explicitly authorized for publication to the existing remote; the four dirty runner files remain local-only.

Private `.env` files, DB volumes, signed links and raw traces are not Git deliverables. Runtime/evidence directories: `~/.local/state/car-delivery-overnight-validation/`, `~/.local/state/car-delivery-driver-voice/`. Never print/copy keys into a prompt. Runner remains **stopped**, with 6 cycles, 358.52 active seconds, 1 coding session / 749646 recorded tokens, 6 live runs / 30 requests consumed. Current local ceilings are 6 runs / 34 requests: **four requests remain but zero runs are authorized**. No additional live/paid call is authorized by this handoff. Do not start the runner or change its queue/counters to make a check green.

Use a new integration worktree for Claude rather than switching these occupied branches. Suggested new app/DB ports are 3111/15441; check availability first. Never copy another worktree's DATABASE_URL and then seed it. Existing fresh-setup guide's ports 15439/19019 and resource names are already allocated here.

## Read existing evidence first

- `PARTICIPANT-BRIEF.md`, `OPERATIONS-CONTEXT.md`, `dataset/{README,SCHEMA}.md`.
- `docs/operations/OPERATING-GUIDE.md`: normal flow, fresh setup and known limits; `VIDEO-OUTLINE.md`: 2–3 minute product/coding-agent story.
- `runner/evidence/iteration3-reconciled-completion.json`: criterion-to-evidence mapping and matched baseline hashes; no gate replay/waiver.
- `docs/verification/selected-order-run6.json`: real Gemini `gemini-3.5-flash-lite`, normal browser selection of CD-420324, then get_order_context → ask_driver, **2 requests**, persisted waiting/reload, no invented ETA/proposal/approval/execution; 26 prior incidents/source order unchanged. Scoped evidence, not live coverage of new-order late proposals.
- `docs/verification/literal-fresh-clone.json`: independent local Git clone at d23341d, npm ci/schema/seed/typecheck/build, 100-order smoke, 58 attachments seeded and both download formats verified, restart persistence. Not a GitHub/network clone.
- `docs/voice/{CONTRACT,README,AGENT-PROMPT}.md`, `VERIFICATION.json`: 35 regressions (includes six voice-client tests), real isolated Postgres/API integration without skips, browser with real SDK + fake microphone/intercepted WebSocket + local model double. **No live ElevenLabs/real microphone/ASR/TTS verification**. All transcript confirmation/duplicate/cancel/resume claims are scoped accordingly.
- On fast-eval-rules, `agent/README.md` and `agent/problems/README.md` supersede older evaluation instructions. Stored `agent/eval_results/live-20261025-103419-A/summary.json` reports 77 cases, ending_accuracy 0.69, weighted_error 0.364, judge false. These are recorded metrics, not checks rerun here or proof of production safety. Main's earlier six-case artifact has ending_accuracy 0.5; don't present either as all-green.

Learned-rule generation reads training reference answers; `--rules` rejects exact source-case overlap. A/B splits separate cases of the same types, not unseen problem types. Review provenance and counterexamples before claiming generalization. Learned rules and the post-model safety net are Python evaluation features; they grant no authority to the TypeScript approval/execution engine. The two rule registries (`agent/rules/` vs `runner/rules/`) serve different purposes.

## Existing UI and backend: reuse, do not rewrite

- `/`: supplied-order board; `/orders/[id]`: snapshot details and attachments.
- `/incidents`: `dataset-dashboard.tsx`, catalogue/problem rows and recent Python investigations; `/incidents/catalog/[id]` detail.
- `/incidents/orders`: `orders/page.tsx`, 100 supplied orders, six future-ferry-eligible orders, selected source, Not checked vs checked/no-action vs human/technical review. Others persist as human-only handoffs.
- `/incidents?view=workspace`: `demo-dashboard.tsx`, decision/waiting/resolved queues. Legacy single-case/mock launchers are preserved separately, not the normal operational path.
- `/incidents/[id]`: evidence/citations/timestamps, timeline, versioned decisions, distinct simulated apply action, conversation and secondary diagnostics. `live-agent-controls.tsx` retains text reply plus additive `driver-voice.tsx`.
- Reuse `starter/app/components/{app-frame,ui,card,icons}.tsx`, record components and `starter/app/incidents/incidents.module.css`. Tokens, fonts, spacing and colours are in `starter/app/globals.css`; don't introduce a second visual system. Read `starter/AGENTS.md` and relevant installed Next docs before UI edits.
- Shared types: `starter/lib/incidents/contracts.ts`; normal selected-order eligibility: `operational.ts`; service: `createOperationalIncident` and `commandIncidentService` in `service.ts`; validated tools/approval/version/idempotency in `engine.ts`; row locks/checkpoints/context in `store.ts`; real provider adapters in `providers.ts`. Simulation time is fixed at `2026-10-21T09:00:00Z`.
- `GET /api/incidents/orders`, `GET/POST /api/incidents`, `GET/POST /api/incidents/:id`. Operational create: `{workflow:"operational",orderId,signalId,provider}`. Existing commands: run, receive_driver_reply, message, decide (approve/reject/alternative + exact version), execute (separate + version). Never silently use mock reasoning when keys fail.
- UI Server Actions: `app/incidents/actions.ts`; signed HttpOnly operator cookie via `operator-access.tsx` / `operator-session.ts`. API writes use the existing bearer-token contract. Keep credentials server-side.
- Voice adds only `GET/POST /api/incidents/:id/voice` and a separate `voice_sessions` table/types. Start/save/confirm lifecycle; transcript append-only + version; confirmation and receiveDriverReply commit atomically. Resume is explicit via existing run. No change to approval/action contracts. Live voice disabled by default; signed URL never persisted. Browser confirms client-reported transcript, not server-authenticated provider transcript.
- Separate Python path: `dataset-runs.ts` invokes `agent/dashboard_runner.py` (120s bound), which uses `case_agent.py`/`mvp.py`. Dataset review is not the ferry booking-execution contract. Inspect bridge compatibility after integrating 63d14da; do not assume fast/rules CLI flags are wired into the Next app. Python live-evaluation HTML is a separate local page, not a new Next route.

## Exact commands for Claude (not run by this handoff)

Existing voice worktree is already installed/seeded; **do not seed again**. After any deliberate integration/lockfile change, use the repository's npm lockfile:

```sh
cd /home/matrix/home/projects/car-delivery-control-room-driver-voice/starter
npm ci                                # only when needed after integration
node --import tsx scripts/tests/operational.test.ts
node --import tsx scripts/tests/voice-client.test.ts
npm run test:incidents                 # targeted safety regression after relevant changes
npm run test:iteration2
npm run typecheck
npm run build
node --env-file=.env node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3110
```

Open http://127.0.0.1:3110/incidents/orders or the workspace; unlock using this worktree's private token locally. Voice is intentionally unavailable until ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID and explicit live enable are configured **after paid-test approval**. Text fallback remains. Do not load the original worktree's provider credentials just to view the UI.

Real isolated-DB voice test, using local provider doubles and the existing 15440 DB only:

```sh
# From voice/starter; no private values printed.
python3 - <<'PYTEST'
from pathlib import Path
import os, subprocess
values=dict(l.split('=',1) for l in Path('.env').read_text().splitlines() if '=' in l and not l.startswith('#'))
assert '@127.0.0.1:15440/controlroom_driver_voice' in values['DATABASE_URL']
env=os.environ.copy();env.update(values);env['VOICE_TEST_DATABASE_URL']=values['DATABASE_URL']
subprocess.run(['node','--import','tsx','scripts/tests/voice-server.test.ts'],env=env,check=True)
PYTEST
```

Other DB integration tests require their explicitly named fresh/disposable DB variables and otherwise skip. Do not count skips as acceptance or point the slow-trigger/seed tests at shared data. Fresh environment instructions are in OPERATING-GUIDE.md; use unique names/ports for another environment, seed only the new empty DB, run incidents:init/attachments:seed, then build/start and `APP_URL=http://127.0.0.1:PORT npm run attachments:smoke` / `npm run smoke`.

For fast-eval-rules only, the page command is `python3 agent/live_eval.py --port 8766`; don't click Run/Full experiment: they make provider/helper/rule-learning calls and are outside the stopped runner's request limiter. Never execute `--learn`, `--rules` evaluation or model discovery casually under the exhausted allowance. Offline rescore is available but rewrites summary/report: copy the run folder first, e.g. `cp -a agent/eval_results/live-20261025-103419-A /tmp/iteration5-eval-review-A` then `python3 agent/evaluate.py --rescore /tmp/iteration5-eval-review-A` on a tree containing 63d14da. It is optional, not required to repeat for this handoff.

## Short prioritized task list

1. Re-fetch and use Claude’s newest reviewed fast-eval-rules tip (63d14da may be stale); assemble operational + newer evaluation + voice once in Claude’s chosen isolated integration worktree, review diffs, preserve dirty runner work/evidence; don't reapply agent-evaluation/overnight commits already in 63d14da. Do not change Claude’s existing worktree/branch/services or merge/push main without the owner's instruction.
2. Confirm iteration-5 scope: latest direction is operational readiness and finishing the user workflow. Earlier roadmap called iteration 5 “Memory” and iteration 4 “Providers”; the later owner explicitly requested voice and deferred incident memory unless operationally useful. Do not add memory/search or more providers merely to satisfy an old numbering scheme.
3. Polish normal UI entry paths, waiting/reply/review/resume, human-only handoff and missing-config/technical states using existing styles/contracts; retain all citations, Not checked, incident-vs-delivery distinction, exact-version approval and separate duplicate-safe apply. Don't build a demo-only alternate flow.
4. Run focused changed-path/safety checks, typecheck/build and a bounded mock-provider UI check after assembly. Existing evidence is version/scenario-bound; do not claim it proves a new combined tree without checking. Existing four moderate npm findings and Next attachment tracing warning remain; no forced upgrades or standalone-.next packaging claims.
5. List live gaps for owner approval only: one ElevenLabs signed-URL request + one max-120s browser conversation, zero business-model calls to capture/confirm. New-order late reply/proposal still lacks current live evidence; continuing the recorded waiting incident could use one newly authorized run capped at four model requests. No allowances are added by this document.
6. Finish reproducible setup/help and the 2–3 minute product + coding-agent video using existing receipts/outline; distinguish live traces from mocks. Full manual human-case assignment/closure, multi-user identity, ongoing changing driver reports and background scheduling remain limited. Do not deploy, publish, submit or implement optional NEXT-DAY-IDEAS without instruction.
