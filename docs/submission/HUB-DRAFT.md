# Hub submission draft

**Status:** text to paste into the hub. Hub field names and word limits are not known yet: adapt it once you see the form. Fill in the two remaining placeholders (video URL, final commit) right before you submit.

## Team

**Aalright**. Members: **[MEMBERS — names to add]**

## Project name

Car Delivery Control Room

## One-line description

A control room that shows a person only the delivery cases that need them. A real LLM agent investigates a driver at risk of missing a booked ferry and brings the operator one decision, with the evidence behind it.

## What it does

Delivery problems take several checks before anyone can decide anything. Someone has to read the messages, find the booking, ask the driver, check the cutoff and compare alternatives. Our control room puts that investigation, its sources, what is still missing, the proposed decision and the action history into one workspace. Cases are split into two queues: *Needs a person* and *Handled by the agent*.

The agent is a real language model in a tool loop (Groq `openai/gpt-oss-120b` or Gemini). It reads the order and asks the simulated driver for an ETA, safety and blockers. It looks up live weather, Autobahn warnings, Finnish roads and trains, then checks the booked ferry against the ETA and searches alternative sailings. Then it stops in one of three ways:
- **Waiting:** a fact is missing, so the case waits. It never invents an ETA.
- **Checked:** no action needed.
- **Proposal:** a versioned proposal goes to a person, with its sources, cost, timing and uncertainty.

A driver can report a problem from a mobile Driver Support page and answer by text or by a labelled simulated call (typed, no phone network). The operator watches it live.

Approval and execution are separate. A person approves one exact proposal version. Applying the simulated booking change is a second step, and repeating it returns the same receipt. A revised proposal needs a new approval. The agent never books, pays, changes a date or contacts a customer. Every result is labelled REAL (live public data) or SIMULATED (driver replies, ferries, quotes, bookings). A missing model key shows a clear message instead of switching silently to mock reasoning.

## Supported scope

- **One workflow:** a booked-ferry connection at risk. Six of the 100 supplied orders qualify. For the others, the agent hands the case to a human and says why.
- **Simulated:** driver replies, alternative sailings and booking effects. **Real:** the model, plus the weather, road, train and flight lookups. No real person is contacted and nothing is purchased.
- **Persistent case history:** source IDs and timestamps, waiting/reply/resume, operator questions, rejection and revision, approval of an exact version, separate execution.
- **Optional, off by default:** a browser voice driver, tested with mocked providers only. Real phone calls were removed on purpose.

## Architecture

The operator interface and the server endpoints are built with Next.js, React and TypeScript. PostgreSQL stores the fixed dataset, plus the incident overlays and audit history. The TypeScript supervisor loop calls Groq or Gemini for real: the model picks a tool, gets its result, and picks again. Server code (not the model) enforces:
- tool arguments and scope;
- the deterministic cutoff check;
- request limits;
- approval versions;
- duplicate protection.

Live context comes from free public APIs: Open-Meteo, autobahn.de, Digitraffic, OpenSky and GDELT. A source that fails is recorded as unavailable. The simulation clock is fixed at `2026-10-21T09:00:00Z`.

There is a separate Python triage agent with an evaluation set (77 cases, stored results). It is an evaluation tool; it does not authorize bookings in the app.

## What was verified

- **Real Groq, end to end, on two orders (CD-420324, CD-420075):** driver report, agent questions, live sources, missed cutoff, alternatives, proposal v1, operator approval, simulated change applied. `../verification/driver-phone/RESULT.md`.
- **Real Gemini on CD-420324:** the model chose `get_order_context` and then `ask_driver`. With no reply from the driver, it stopped at *waiting*, without inventing an ETA. `../verification/selected-order-run6.json`.
- **Earlier real-model ferry cases:** evidence-backed proposals, versioned review and duplicate-safe simulated execution. `../overnight/final-acceptance-demo.md`.
- **Checks on main:** typecheck, build, the provider-double test suites, smoke checks over all 100 orders, attachment downloads and a fresh-database setup. `../verification/main-check-20261025.md`.

**Not verified:** real ElevenLabs audio, use by several operators at once, and incident types other than the ferry connection. Passing tests do not prove there are no bugs. We claim no measured time saving.

## Links

- Repository: https://github.com/olivierFer3/car-delivery-control-room
- Setup instructions: the repository `README.md` ("Run it from a fresh clone")
- Video: **[VIDEO_URL]**
- Final commit: **[FINAL_COMMIT — `git rev-parse --short HEAD` after the last push]**

This is a participant prototype for Bahn's fictional challenge, not a deployed Bahn system.
