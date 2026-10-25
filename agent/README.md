# Triage agent, test cases and evaluation

French version: [README.fr.md](README.fr.md).

Standard-library Python only, nothing to install. It reads `dataset/data/*.jsonl` directly; Postgres and
Node are not needed for this part.

## Keys

Put each key alone on one line in a file at the repository root (all three files are ignored by git):

- `groq_api_key.txt`: Groq key (free at console.groq.com). Used by the agent in `groq` mode.
- `gemini_api_key.txt`: Gemini key (Google AI Studio). Used by the agent in `fast` mode and by the helpers.
  A key from a Google project without billing stays on the free tier: requests beyond the quota are
  refused, never billed. Check the tier in Google AI Studio, page "API keys".
- `openrouter_api_key.txt`: OpenRouter key. Used in `openrouter` mode only, by the agent and the helpers (see below).

## The agent

```sh
python3 agent/mvp.py                     # the on-the-road agent on CD-420322 (the Bentley safety stop)
python3 agent/mvp.py --models            # Groq models available to your key
```

`case_agent.py` runs the same agent on any test case. It reads the case and its messages, asks the
simulated driver or site, looks things up, then must finish in one of three ways:
**alone** (no person needed), **a person decides** (one prepared decision), or **a person only**
(customer needed, emergency). It never books, pays, changes a promise or contacts the customer: tools
for these exist but are blocked, and every call counts as a fault.

Every agent call carries the instructions and a **triage playbook** (when to finish alone, when to
prepare a decision, when only a person can act). `--context full` adds Bahn's operations guide.

**Safety net.** Fixed hand-written rules applied after the agent concludes. They read what the case says
and what people replied (never a test label, never the agent's own wording) and can only move a case
towards a person: fines, claims, conflicting customer instructions, safety events, a car that must not be
driven, or an agent confidence below "high". A blocked forbidden-tool call is counted as a fault but does
not move the case by itself. Tuned on the hand-written cases and on split A; probed without model calls on
the 3,850 synthetic cases, they never move a case that the agent should handle alone (the agent's real
conclusions on new cases can still differ).

## Test cases

`agent/problems/` holds the datasets, see [problems/README.md](problems/README.md): 74 problems from
Bahn's packet, 31 hand-written test cases and 3,850 synthetic cases (77 problem types × 50).

## Evaluation

The two headline measures, both to minimise, the first above all:

1. **Handled alone wrongly**: the agent closed a case a person had to handle (rate over the cases that
   needed a person). A risk.
2. **Sent to a person wrongly**: a person was bothered for a case the agent should have handled (rate
   over the cases the agent should handle). A cost.

Other failures (a mix-up between "a person decides" and "a person only", a forbidden tool called, a
must-not broken per the judge) count once, like the second error, and are not counted twice when the case
is already a triage error. Combined score = (first × 3 + second + other failures) / cases (`--weight`).
Both triage errors are given for the agent alone and after the safety net, on the same run.

### Live page (recommended)

```sh
python3 agent/live_eval.py        # then open http://127.0.0.1:8765
```

Pick the agent model, case set, cases per type, split and options, then **Run**. The page updates every
1.5 s: the two errors, the score, progress, time left and each finished case. EN/FR switch at the top.

**Full experiment** (one button): split **A** (one case per type, 77 cases) without learned rules →
**learn rules** from A (one general, conditional rule per case, then merged with the rules already learned)
→ the chosen split (**B** or **C**, 77 other cases of the same types) **with** the rules → the same split
**without** them (control). The runs are compared in a table. Rules are refused on any case they came from,
and a rule that would let the agent book, pay, cancel, assign or approve is dropped.

### Command line

```sh
python3 agent/evaluate.py --file synthetic --per-type 1 --split A --mode fast --learn
python3 agent/evaluate.py --file synthetic --per-type 1 --split B --mode fast --rules
python3 agent/evaluate.py --file synthetic --per-type 1 --split B --mode fast
python3 agent/evaluate.py --rescore agent/eval_results/<run>     # recompute an earlier run, no API call
```

Options: `--mode fast|groq|openrouter`, `--split A|B|C`, `--context lean|full`, `--judge`, `--workers N`,
`--weight W`, `--lang en|fr`. Each run writes `results.jsonl`, `summary.json` and `report.html` to
`agent/eval_results/<run>/`.

### Speed and models

| Mode | Agent | Helpers (driver, site, search, rule writer) | 77 cases |
|---|---|---|---|
| `fast` (default) | Gemini `gemini-3.1-flash-lite` + `gemini-3.5-flash-lite` | Groq `gpt-oss-20b`, then Gemma | about 5-7 min |
| `groq` | Groq `gpt-oss-120b` | Gemini pool, then `gpt-oss-20b` | 30+ min on the free tier, over the daily quota |
| `openrouter` | OpenRouter `OPENROUTER_MODEL` (default `openai/gpt-oss-120b`) | OpenRouter `OPENROUTER_HELPER_MODEL` (default `openai/gpt-oss-20b`) | credit-bound, paced at 20 requests per minute per model |

The free tiers decide this: Groq allows `gpt-oss-120b` 8,000 tokens per minute and 200,000 per day
(77 cases need ~260,000); the two Flash Lite models allow 15 requests per minute each, 250,000 tokens per
minute and 500 requests per day. Calls are paced under each model's limits, and a model that refuses
(rate limit, invalid tool call, server error, timeout) passes the call to the next one of its pool. A
model at its daily limit is dropped; when every model is, the run stops at once and keeps the cases done.

Fewer tokens per case: the case and its messages come with the first message, `gpt-oss` reasoning is
set to low, helper replies are capped, and the lean context is the default (`--context full` adds Bahn's
operations guide, ~1,200 more tokens per call). Learned rules and the playbook contain no test case and no
expected answer.

### Daily quota guard

A counter in `agent/.usage.json` (ignored by git) records requests and tokens per model for the quota day
(midnight Pacific time, when Google renews), corrected by Groq's own `x-ratelimit` headers when present. A
model at 95 % of its daily limit is no longer used. Before a run starts, the live page estimates the requests
it needs (about 2.8 agent calls and 0.8 helper calls per case, measured on 2026-10-25) and refuses to start
if today's remaining quota does not cover them. The limits in `mvp.DAILY_LIMITS` are the free-tier figures
read from the Groq console and Google AI Studio on 2026-10-25; check them there if they change.

### OpenRouter and cost control

In `openrouter` mode every call goes to OpenRouter: the agent on `OPENROUTER_MODEL`, simulated people, search
and rule writing on the cheaper `OPENROUTER_HELPER_MODEL`. No Groq or Gemini key is used. Each OpenRouter call asks for its billed cost (`usage.include`) and caps the answer at
2,000 tokens. Evaluations stop at `OPENROUTER_BUDGET_USD` (default 5 dollars) spent on the quota day, so the
rest of the credit is kept; the live page shows the day's spend and the key's credit (`/api/v1/key`, no model
call). Before a run, the page prices it from the model's listed price and about 7,500 input and 400 output
tokens per case, and refuses it above the cap.

**What is verified:** the cost controls (agent-only routing, answer cap, cost recording, dollar cap refusing
calls before they are sent, price-based estimate, credit display) were tested against a fake OpenRouter
server initially; a subsequent real three-case run is documented below. **Costs are estimates, not guarantees:** real
token counts per case vary, and prices are read from OpenRouter at the time of the run.


### Real OpenRouter run (25 October 2026)

Run `live-20261025-131417-run` handled three cases with five real OpenRouter calls and no API error. All three
endings were correct; a sample this small does not show overall reliability. Recorded cost: 0.000455 USD. Video,
self-contained report and method: [artifacts/openrouter-demo](../artifacts/openrouter-demo/README.md). This
complements the earlier cost tests against a fake server described above. At that time the helpers were still on
free Groq/Gemini models.
