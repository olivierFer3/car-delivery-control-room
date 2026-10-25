# Triage agent, test cases and evaluation

French version: [README.fr.md](README.fr.md).

Standard-library Python only, nothing to install. It reads `dataset/data/*.jsonl` directly; Postgres and
Node are not needed for this part.

## Keys

Put each key alone on one line in a file at the repository root (both files are ignored by git):

- `groq_api_key.txt`: Groq key (free at console.groq.com). Used by the agent in `groq` mode.
- `gemini_api_key.txt`: Gemini key (Google AI Studio). Used by the agent in `fast` mode and by the helpers.
  A key from a Google project without billing stays on the free tier: requests beyond the quota are
  refused, never billed. Check the tier in Google AI Studio, page "API keys".

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

**Safety net.** Fixed hand-written rules applied after the agent concludes. They read the case and the
agent's conclusion (never a test label) and can only move a case towards a person: fines, claims,
conflicting customer instructions, safety events, a car that must not be driven, a conclusion that books
or pays something, or an agent confidence below "high". Tuned on the 31 hand-written cases; on the 3,850
synthetic cases they never move a case that the agent should handle alone.

## Test cases

`agent/problems/` holds the datasets, see [problems/README.md](problems/README.md): 74 problems from
Bahn's packet, 31 hand-written test cases and 3,850 synthetic cases (77 problem types × 50).

## Evaluation

The two headline measures, both to minimise, the first above all:

1. **Handled alone wrongly**: the agent closed a case a person had to handle (rate over the cases that
   needed a person). A risk.
2. **Sent to a person wrongly**: a person was bothered for a case the agent should have handled (rate
   over the cases the agent should handle). A cost.

A combined score weighs the first 3 times (`--weight`). Both are given for the agent alone and after
the safety net, on the same run.

### Live page (recommended)

```sh
python3 agent/live_eval.py        # then open http://127.0.0.1:8765
```

Pick the agent model, case set, cases per type, split and options, then **Run**. The page updates every
1.5 s: the two errors, the score, progress, time left and each finished case. EN/FR switch at the top.

**Full experiment** (one button): split **A** (one case per type, 77 cases) without learned rules →
**learn rules** from A (one general rule per case, then merged) → split **B** (77 other cases of the same
types) **with** the rules → split **B without** the rules (control). The runs are compared in a table.
Rules are refused on the cases they came from.

### Command line

```sh
python3 agent/evaluate.py --file synthetic --per-type 1 --split A --mode fast --learn
python3 agent/evaluate.py --file synthetic --per-type 1 --split B --mode fast --rules
python3 agent/evaluate.py --file synthetic --per-type 1 --split B --mode fast
python3 agent/evaluate.py --rescore agent/eval_results/<run>     # recompute an earlier run, no API call
```

Options: `--mode fast|groq`, `--split A|B|C`, `--context lean|full`, `--judge`, `--workers N`,
`--weight W`, `--lang en|fr`. Each run writes `results.jsonl`, `summary.json` and `report.html` to
`agent/eval_results/<run>/`.

### Speed and models

| Mode | Agent | Helpers (driver, site, search, rule writer) | 77 cases |
|---|---|---|---|
| `fast` (default) | Gemini `gemini-3.1-flash-lite` + `gemini-3.5-flash-lite` | Groq `gpt-oss-20b`, then Gemma | about 5-7 min |
| `groq` | Groq `gpt-oss-120b` | Gemini pool, then `gpt-oss-20b` | 30+ min on the free tier, over the daily quota |

The free tiers decide this: Groq allows `gpt-oss-120b` 8,000 tokens per minute and 200,000 per day
(77 cases need ~260,000); the two Flash Lite models allow 15 requests per minute each, 250,000 tokens per
minute and 500 requests per day. Calls are paced under each model's limits, and a model that refuses
(rate limit, invalid tool call, server error, timeout) passes the call to the next one of its pool. A
model at its daily limit is dropped; when every model is, the run stops at once and keeps the cases done.

Fewer tokens per case: the case and its messages come with the first message, `gpt-oss` reasoning is
set to low, helper replies are capped, and the lean context is the default (`--context full` adds a
triage playbook and Bahn's operations guide, ~2,000 more tokens per call). Learned rules and the
playbook contain no test case and no expected answer.
