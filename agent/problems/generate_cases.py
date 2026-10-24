"""Ask Groq for more invented test cases and keep only the ones that pass every check.

The hand-written cases in test_cases.py stay the reference: two of them are shown
to the model as examples, and every existing problem type is listed so the model
writes new situations instead of variants. Output goes to its own file, marked
with the model that wrote it, so generated and hand-written cases never mix.

    python3 agent/problems/generate_cases.py              # 3 new cases per domain
    python3 agent/problems/generate_cases.py --per-domain 5
    GROQ_MODEL=... python3 agent/problems/generate_cases.py

Uses the Groq key of agent/mvp.py (groq_api_key.txt at the repo root).
Re-running appends; problem types already in either file are skipped.
"""

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))

import mvp  # noqa: E402  Groq access shared with the agent
import test_cases  # noqa: E402
import validate  # noqa: E402

OUT = HERE / "data" / "test_cases_generated.jsonl"
DOMAINS = {
    "on_the_road": "breakdowns, accidents, delays, weather, tracking gaps while the car is moving",
    "driver_travel": "how the driver reaches the pickup and gets home: trains, buses, flights, ferries, hotels",
    "dispatch": "finding, booking, replacing and scheduling drivers for jobs",
    "pickup_readiness": "whether the car, keys, papers and the person releasing it are ready at pickup",
    "delivery_handover": "handing the car over at the destination: receivers, addresses, opening hours, condition remarks",
    "evidence_documents": "photos, CMR, signatures, registration and export papers",
    "costs": "driver expenses, tolls, fines, fees and reimbursements",
    "order_data": "missing, wrong or conflicting order information",
    "support": "routine driver questions about the app, payment, rules",
}
HANDOFFS = ("agent_alone", "person_decides", "person_only")
PHASES = ("intake", "before_pickup", "in_transit", "after_delivery")
SEVERITIES = ("low", "medium", "high", "critical")

SYSTEM = """You write test cases for an operations agent at a car delivery company. Freelance drivers drive
used cars one by one between Germany, Denmark, Sweden, Finland and the Baltics, often with a ferry.

Rules of the company the agent must follow:
- The agent never contacts a customer (anyone who pays: the dealer buying or selling). Drivers and pickup or
  delivery sites may be contacted.
- A person says yes before any booking, date change, cost or customer message. Asking and looking up need no yes.
- Policies in force: {policies}

Everything is fictional: invent people and companies and add "(fictional)" after company names. Real cities,
roads and ferry routes are fine. No real company names.

Return JSON: {{"cases": [case, ...]}}. Each case has exactly these keys, like the examples:
code (UPPER_SNAKE, new), domain, phase ({phases}), severity ({severities}), summary (one sentence),
now (ISO UTC), order (reference T-2xxx, vehicle, from, to, customer, driver, pickup_local, delivery_local; local
times with the IANA zone name, null when not relevant), facts (list of [fact, source]), messages (list of
{{at, from, to, channel, text}}), driver (what the simulated driver knows and says, or null), site (same for the
site, or null), solution (steps; mark [approval] and [person only]), handoff ({handoffs}),
must (list), must_not (list).

The facts and the simulated people must hold everything needed to reach the expected handoff. Make the
cases realistic and different from each other. Include easy cases the agent should finish alone; an agent that
escalates those is wrong, so put "escalate to a person" in must_not there."""


def existing_codes():
    codes = {case["code"] for case in test_cases.CASES}
    if OUT.exists():
        codes |= {json.loads(line)["problem_type"] for line in OUT.read_text().splitlines() if line.strip()}
    return codes


def check_case(case, domain, codes):
    """Reasons to reject a generated case; empty when it is usable."""
    problems = []
    needed = ("code", "domain", "phase", "severity", "summary", "now", "order", "facts", "messages", "driver", "site",
              "solution", "handoff", "must", "must_not")
    missing = [key for key in needed if key not in case]
    if missing:
        return [f"missing {', '.join(missing)}"]
    if case["domain"] != domain:
        problems.append(f"domain {case['domain']!r}, asked {domain!r}")
    if case["code"] in codes:
        problems.append(f"type {case['code']} already exists")
    if case["handoff"] not in HANDOFFS:
        problems.append(f"handoff {case['handoff']!r}")
    if not case["must"] or not case["must_not"]:
        problems.append("empty must or must_not")
    try:
        case["facts"] = [tuple(fact) for fact in case["facts"]]
        record = test_cases.record(0, case)
    except (TypeError, ValueError, KeyError) as error:
        return problems + [f"bad shape: {error}"]
    errors = []
    validate.check(record, validate.SCHEMA, "$", errors)
    return problems + errors[:5]


def generate(domain, count, codes):
    # One example from the same domain and one easy case the agent finishes alone, in the exact format to return.
    same = next(case for case in test_cases.CASES if case["domain"] == domain)
    easy = next(case for case in test_cases.CASES if case["handoff"] == "agent_alone" and case is not same)
    prompt = (
        f"Write {count} new test cases for the domain {domain!r}: {DOMAINS[domain]}.\n"
        f"Mix the handoffs. Problem types that already exist (do not reuse): {', '.join(sorted(codes))}.\n"
        f"Two existing cases, for the format and the level of detail:\n{json.dumps([same, easy], ensure_ascii=False)}"
    )
    system = SYSTEM.format(policies=" ".join(test_cases.POLICY.values()), phases=", ".join(PHASES),
                           severities=", ".join(SEVERITIES), handoffs=", ".join(HANDOFFS))
    reply, stats = mvp.chat([{"role": "system", "content": system}, {"role": "user", "content": prompt}],
                            temperature=0.8, response_format={"type": "json_object"})
    try:
        return json.loads(reply.get("content") or "{}").get("cases", []), stats
    except json.JSONDecodeError:
        return [], stats


def main(per_domain):
    model = mvp.pick_model()
    codes = existing_codes()
    start = sum(1 for line in OUT.read_text().splitlines() if line.strip()) if OUT.exists() else 0
    kept, rejected = [], 0
    for domain in DOMAINS:
        cases, stats = generate(domain, per_domain, codes)
        print(f"{domain:<20} {len(cases)} received in {stats['seconds']}s")
        for case in cases:
            reasons = check_case(case, domain, codes)
            if reasons:
                rejected += 1
                print(f"   rejected {case.get('code', '?')}: {'; '.join(reasons)}")
                continue
            codes.add(case["code"])
            record = test_cases.record(start + len(kept) + 1, case)
            record["id"] = f"gen-{start + len(kept) + 1:04d}"
            record["source"]["origin"] = f"groq:{model}"
            kept.append(record)
            print(f"   kept     {case['code']} ({case['handoff']})")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("a", encoding="utf-8") as handle:
        for record in kept:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
    print(f"\n{len(kept)} kept, {rejected} rejected -> {OUT} (model {model})")
    print("Read them before use: the expected answers are the model's judgement.")


if __name__ == "__main__":
    args = sys.argv[1:]
    main(int(args[args.index("--per-domain") + 1]) if "--per-domain" in args else 3)
