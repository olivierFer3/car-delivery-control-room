"""Learn general triage rules from an evaluation run, and load them for another run.

For each evaluated case, a helper model reads the case, what the agent did, and the reference handoff, and
writes at most one general rule (no names, places, amounts or references). A second call merges them into
a short list. The file keeps which cases the rules came from, so evaluate.py can refuse to score a run on
those same cases with these rules.

    python3 agent/rules.py agent/eval_results/<run>          # learn from a run, write agent/rules/learned_rules.json
"""

import json
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import mvp  # noqa: E402

RULES_FILE = HERE / "rules" / "learned_rules.json"
MAX_RULES = 20

PER_CASE = """You improve the triage rules of an operations agent at a car delivery company. The agent must finish a
case alone, prepare one decision for a person (person_decides), or leave it to a person only (person_only).
You get one case, what the agent did, and the reference handoff with its reasoning.
Write at most ONE general rule that would make the agent reach the reference handoff in similar situations.
The rule must be general: no names, places, companies, amounts, dates, order references or car models.
Form: "When <kind of situation>, <what to do / which handoff>, because <reason>." Max 45 words.
If the agent was already right and the case teaches nothing beyond the obvious, return null.
Return JSON: {"rule": str or null}"""

MERGE = """You merge triage rules for an operations agent at a car delivery company. Merge duplicates and near
duplicates, drop rules that are case-specific or contradict each other, keep the most useful ones, at most
%d. Keep each rule general (no names, places, amounts, references) and under 45 words.
Return JSON: {"rules": [str, ...]}""" % MAX_RULES


def _json(reply):
    try:
        return json.loads((reply.get("content") or "").strip().removeprefix("```json").removesuffix("```").strip())
    except json.JSONDecodeError:
        return {}


def rule_for(result, model):
    case, trace, score = result["case"], result["trace"], result["score"]
    finish = trace.get("finish") or {}
    payload = {
        "case": case["summary"], "facts": case["test"]["given"]["facts"],
        "messages": [m["text"] for m in case["timeline"]],
        "agent_steps": [s["tool"] for s in trace["steps"] if s.get("tool")],
        "agent_handoff": score.get("got_raw", score["got"]),
        "agent_conclusion": finish.get("recommendation") or finish.get("summary") or "",
        "reference_handoff": score["expected"], "reference_reasoning": case["solution"]["text"],
    }
    try:
        reply, _ = mvp.chat([{"role": "system", "content": PER_CASE}, {"role": "user", "content": json.dumps(payload, ensure_ascii=False)}],
                            model=model, temperature=0.2, response_format={"type": "json_object"}, max_completion_tokens=800)
    except SystemExit:
        return None
    rule = _json(reply).get("rule")
    return rule.strip() if isinstance(rule, str) and rule.strip() else None


def learn(results, model, run_name, workers=6):
    """Rules from these results (one call per evaluated case, then one merge). Returns the saved document."""
    evaluated = [r for r in results if not r["trace"]["error"]]
    with ThreadPoolExecutor(max_workers=workers) as pool:
        proposed = list(pool.map(lambda r: (r["case"]["id"], rule_for(r, model)), evaluated))
    raw = [{"case_id": case_id, "rule": rule} for case_id, rule in proposed if rule]
    rules = [item["rule"] for item in raw]
    if len(rules) > 1:
        try:
            reply, _ = mvp.chat([{"role": "system", "content": MERGE}, {"role": "user", "content": json.dumps(rules, ensure_ascii=False)}],
                                model=model, temperature=0.1, response_format={"type": "json_object"}, max_completion_tokens=2500)
            merged = [rule for rule in _json(reply).get("rules", []) if isinstance(rule, str) and rule.strip()]
            rules = merged[:MAX_RULES] or rules[:MAX_RULES]
        except SystemExit:
            rules = rules[:MAX_RULES]
    document = {
        "created_at": datetime.now().isoformat(timespec="seconds"), "from_run": run_name, "model": model,
        "source_case_ids": [r["case"]["id"] for r in evaluated], "rules": rules, "proposed": raw,
    }
    RULES_FILE.parent.mkdir(parents=True, exist_ok=True)
    RULES_FILE.write_text(json.dumps(document, indent=2, ensure_ascii=False), encoding="utf-8")
    return document


def load(path=None):
    path = Path(path or RULES_FILE)
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


if __name__ == "__main__":
    folder = Path(sys.argv[1])
    results = [json.loads(line) for line in (folder / "results.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()]
    helper = mvp.configure(sys.argv[2] if len(sys.argv) > 2 else "fast")
    document = learn(results, helper, folder.name)
    print(f"{len(document['rules'])} rules from {len(document['source_case_ids'])} cases -> {RULES_FILE}")
    for rule in document["rules"]:
        print(" -", rule)
