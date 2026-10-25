# Problem datasets

French version: [README.fr.md](README.fr.md).

One operational problem per line, in the format set by `schema.json` (version 1.1).

```sh
python3 agent/problems/build_bahn.py          # rebuilds data/problems.jsonl from dataset/data
python3 agent/problems/validate.py            # checks a file against schema.json
python3 agent/problems/validate.py other.jsonl
```

## Problems from Bahn's packet (`data/problems.jsonl`)

Bahn's packet spreads one problem over several tables: the alert, the incident, the open work item, the
agent proposal, the conversation. The script **groups** them into one problem:

- **Explicit reference**: one record cites another (`alert_id`, `source_refs`, `evidence_refs`,
  `conversation_id`…). Citing a message links its conversation.
- **Same assignment, within 2 h**: an incident or site visit that cites nothing joins the alert of the same
  driver assignment raised closest in time.

Each link is written in `source.grouping` with its rule, so a grouping can be checked or challenged. Tables
read as problem sources: alerts, incidents, work items, agent proposals, conversations, support threads,
conflicting statements about an address or contact, assets in custody (keys), failed visits, rejected
proofs, missing documents, rejected expenses.

**Content (snapshot of 21 Oct 2026):** 74 problems, 37 open. By domain: pickup_readiness 17,
on_the_road 12, costs 11, driver_travel 10, evidence_documents 9, order_data 9, dispatch 3,
delivery_handover 2, support 1. Ten human decisions on agent proposals: 6 approved, 3 edited, 1 rejected.

## Fields

| Field | Content |
|---|---|
| `id` | Stable, prefixed with the origin (`bahn-…`, `test-…`, `syn-…`, `gen-…`; `manual-…` for your own) |
| `source` | `origin`, `snapshot_at`, the grouped records, the links and their rule |
| `order` | Main order (reference, status, car) or `null` when no safe link exists |
| `problem_type` | Upper-case code: `VEHICLE_WARNING`, `FERRY_SOLD_OUT`, `EXPENSE_REJECTED`… |
| `domain` | Closed list: on_the_road, driver_travel, dispatch, pickup_readiness, delivery_handover, evidence_documents, costs, order_data, support, other |
| `phase` | intake, before_pickup, in_transit, after_delivery, cancelled, no_order_link, unknown |
| `severity`, `status` | low…critical or null · open / resolved / scenario |
| `summary`, `owners`, `waiting_on` | What is happening, who holds it, what it waits for |
| `next_actions` | Next steps **as written** by the operator, with their source |
| `agent_work` | Agent proposals: command, rationale, proposed content |
| `human_decisions` | APPROVED / EDITED / REJECTED, by whom, when, final content |
| `resolution` | How it ended, with the source |
| `timeline` | The messages, in order, with sender, recipient, channel, visibility and language |
| `evidence_refs` | Other records cited (tracking, events, offers…) |
| `solution` | **The problem's solution**: `status`, `text`, `sources` (below) |
| `test` | Test cases only: what the agent sees, the simulated people, what is expected |

### `solution`

Taken only from what the records say, never invented:

- `applied` (35): resolved; the text says what was done (resolution reason, human decision on an agent
  proposal, last operator reply).
- `planned` (20): open; the text is the next step written by the operator, or a person's decision on an
  agent proposal.
- `none` (19): nothing in the records says how to solve it.
- `expected` (test cases): the reference answer of an invented case, never something that happened.

Each piece of the text has its source in `sources`, in the same order.

## Invented test cases (`data/test_cases.jsonl`)

31 cases written from scratch, without reusing the situations of Bahn's packet (fictional names, companies
and references, prefix `test-`, `source.origin = invented_test_case`). They live in `test_cases.py`, readable
and editable; `python3 agent/problems/test_cases.py` rebuilds the file.

Same format, with `status = "scenario"`, `solution.status = "expected"` (`[approval]` marks what needs a
person's yes, `[person only]` what involves the customer) and a `test` block:

- `given`: the time, the order (local times with the zone), the facts with their source; the messages
  already exchanged are in `timeline`;
- `simulated`: what the simulated driver and site know and answer;
- `expected.handoff`: `agent_alone` (16), `person_decides` (12), `person_only` (3);
- `expected.must` / `must_not`: what the agent must do and must never do.

The rules that hold everywhere (never contact the customer, book nothing without a yes) apply to every
case even when `must_not` does not repeat them.

## Synthetic cases, no API (`data/test_cases_synthetic.jsonl`)

```sh
python3 agent/problems/synthetic_cases.py                  # 50 cases per type: 77 types, 3,850 cases
python3 agent/problems/synthetic_cases.py --per-type 100
```

77 hand-written situation templates in `synthetic_cases.py`, one per problem type, each turned into 50
cases (ids `syn-00001…`). Deterministic: the same command always writes the same file. Each variant changes:

- **what decides the answer**: an amount under or over a limit, arrival before or after a slot or ferry
  check-in, a site that answers or not, an amber or red warning, minor or major damage… 39 of the 77 types
  have two expected endings, with at least 10 cases on each side;
- **the setting**: real cities and their time zones, a ferry or bridge only when the route uses one, cars
  (electric when the case needs it), fictional people and companies, November to March dates, slots in
  local business hours, driver messages in German, Finnish, Swedish or Danish for
  `DRIVER_MESSAGE_OTHER_LANGUAGE`.

Split: agent_alone 1,534, person_decides 1,825, person_only 491. These are variants of 77 situations:
measure **per type**, then average the types. Evaluation splits A, B and C take different cases of each type.

## Cases generated by Groq (`data/test_cases_generated.jsonl`)

```sh
python3 agent/problems/generate_cases.py                 # 3 new cases per domain
python3 agent/problems/generate_cases.py --per-domain 5
```

Shows Groq two hand-written cases and the types already covered, then keeps only the cases that pass every
check (format, allowed values, new type); rejections are printed with their reason. Kept cases have
`gen-…` ids and `source.origin = groq:<model>`. The expected answers are the model's judgement: review them.

## Adding problems from another source

Write a JSONL file in the same format, check it with `validate.py`, then add it. Minimum for a hand-written
problem:

```json
{"id": "manual-0001", "schema_version": "1.1",
 "source": {"origin": "manual", "snapshot_at": null, "records": [], "grouping": []},
 "order": null, "related_order_ids": [], "problem_type": "FERRY_MISSED", "domain": "driver_travel",
 "phase": "in_transit", "severity": "high", "status": "resolved", "opened_at": null, "resolved_at": null,
 "summary": "Driver missed the evening ferry after a motorway closure.", "owners": [], "waiting_on": [],
 "next_actions": [], "agent_work": [], "human_decisions": [], "resolution": [], "timeline": [],
 "evidence_refs": [], "solution": {"status": "applied", "text": "Rebooked the next sailing; a person approved one hotel night.", "sources": []}}
```

If you change the format, raise `schema_version` in `schema.json` and in the scripts.

## Cautions

Everything is fictional. `next_actions` and summaries are operators' interpretations, not verified facts.
An alert is a reason to look, not a diagnosis. Messages can contradict each other: keep the sender and time.
