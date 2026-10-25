# Hub submission draft

**Status:** editable submission copy, not published. Based on recorded operational/voice evidence, not a claim that Claude's unfinished iteration-5 integration has passed. Hub field names/limits are unknown; adapt after checking the actual form.

## Project name

Car Delivery Control Room **[WORKING TITLE — confirm team choice]**

## One-line description

An evidence-backed incident workspace where a real LLM investigates a fictional delivery risk and a human approves any proposed booking change.

## What it does

Delivery alerts often require several checks before anyone can decide what to do. Our application brings the investigation, its sources, missing information, proposed decision and action history into one workspace.

An operator can browse all 100 supplied orders, open a supported ferry-risk investigation, and follow the agent's model-selected tool calls. The agent reads the selected order, asks the simulated driver for missing facts and checks booking constraints. It can wait for information, retain a safe connection with evidence, or prepare a versioned proposal for human review. Unsupported sources are explicitly handed to a human.

Approval and applying a simulated booking change are separate. A material revision needs new approval; duplicate execution returns the existing receipt. An incident marked resolved is not a claim that the car was delivered. Missing provider configuration and technical errors never silently switch to mock reasoning or become business conclusions.

## Supported scope

- One workflow: future booked-ferry connection risk in Bahn's synthetic environment. Recorded eligibility checks found six compatible supplied orders; other sources require human review.
- Explicit simulated driver replies, fictional travel alternatives and booking effects. No real people are contacted, and no real purchase or booking is made.
- Persistent incident history, source IDs/timestamps, waiting/reply/resume, operator questions, rejection/revision, exact-version approval and separate execution.
- The voice feature is prepared on its own branch: an operator acts as a fictional driver, reviews a captured transcript and confirms a structured reply. **Its provider responses/audio transport were mocked in tests. Real ElevenLabs microphone/ASR/TTS behavior is unverified; final integration is pending Claude's work.** Omit this feature from the headline if it is not ready at submission time.

## Architecture

Next.js/React/TypeScript provides the operator interface and server endpoints. PostgreSQL stores incident overlays and audit history alongside the fixed dataset; Drizzle supports the supplied snapshot schema. The TypeScript supervisor loop uses configured Groq/Gemini adapters to make real model requests. The model selects a tool, receives its result and chooses again. The server enforces tool arguments, scope, deterministic timing checks, execution limits, approval versions and duplicate protection.

Driver responses, travel services and booking effects are simulated. Simulation time is fixed at `2026-10-21T09:00:00Z`. The optional voice branch uses the official ElevenLabs browser SDK and server-generated signed session URLs; API keys remain server-side. Transcript confirmation calls the existing reply contract, then leaves incident resume explicit.

There is also a separate Python triage/evaluation path with stored evaluation results. It is not the TypeScript booking-execution authority. Learned evaluation rules cannot supply present-case evidence or approval. Avoid presenting evaluation scores as proof that the integrated product is complete or safe in every case.

## What was verified — exact boundaries

- A real Gemini normal-browser investigation on CD-420324 selected `get_order_context` then `ask_driver`; it persisted waiting after no response, without inventing an ETA. This recorded run used two model requests and preserved the source order and 26 earlier incidents.
- Earlier real-model ferry cases and browser checks recorded evidence-backed proposals, versioned review and separate duplicate-safe simulated execution. Those are scenario/revision-bound results, not a new live test of every selected-order branch.
- Provider-double tests exercised normal selected-order API/persistence/recovery/review flows. Voice tests used real PostgreSQL and the real browser SDK, with fake microphone, signed-URL/WebSocket responses and business-model responses.
- A literal independent local Git clone at `d23341d` passed setup, typecheck/build, 100-order checks and signed-URL downloads for both attachment formats. This predates final voice/integration work and is not final-release fresh-clone evidence.

- On main with the official logo, typecheck, build, the provider-double test suites listed there, both smoke scripts and a fresh-database setup passed (`../verification/main-check-20261025.md`); three database tests refused to run against a different database, and no real-model or voice call was made.

**Not yet established:** a real-provider run on the final build; final-release reproducibility; live ElevenLabs audio; a real-provider late-reply/proposal run on the newly generalized order path; production multi-user operation or broad incident automation. Passing tests is not proof of no bugs. No measured operator-time saving is claimed.

## Links and credits — complete before submission

- Repository: **[REPOSITORY_URL — confirm accessible public repository and final branch/commit]**
- Video: **[VIDEO_URL — record, upload and check access manually]**
- Team / members: **[TEAM_NAME_AND_MEMBERS]**
- Final integrated commit: **[FINAL_COMMIT — supplied by Claude/owner]**
- Demo instructions: **[FINAL_README_OR_SETUP_LINK — validate against that commit]**

Editor context only: the existing repository is `https://github.com/olivierFer3/car-delivery-control-room`. A valid URL alone does not prove the final feature set is on its default branch. Confirm the actual submission target rather than promising an unmerged branch is integrated. This is a participant prototype for Bahn's fictional challenge, not a deployed Bahn operations system.

Sources: `../verification/selected-order-run6.json`, `../verification/literal-fresh-clone.json`, `../voice/VERIFICATION.json`, `../operations/OPERATING-GUIDE.md`, `../../PARTICIPANT-BRIEF.md`.
