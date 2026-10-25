"""Evaluate the agent on test cases and write a web report.

    python3 agent/evaluate.py --file synthetic --per-type 1 --split A --mode fast --learn   # 77 cases, then learn rules
    python3 agent/evaluate.py --file synthetic --per-type 1 --split B --mode fast --rules   # 77 other cases, with the rules
    python3 agent/evaluate.py --file synthetic --per-type 1 --split B --mode fast           # same cases, without (control)
    python3 agent/evaluate.py --rescore agent/eval_results/<run>                            # recompute, no API call

Headline measures, both to minimise, the first above all:
  - handled alone although a person had to handle it (rate over the cases that needed a person);
  - sent to a person although the agent should have handled it (rate over the cases the agent should handle).
The weighted error counts the first 3 times (--weight). An agent that ends without a conclusion counts as
sent to a person. Both are given for the agent alone and after the safety net (case_agent.safety_net).

Also per case: trap tools (any call to message the customer, book or pay, change the promise is a fault) and,
with --judge, must / must_not read by a judge model. Averages are per problem type.

--mode fast runs the agent on the Gemini Flash Lite models (77 cases in minutes), --mode groq on gpt-oss-120b.
--split A|B|C takes different cases of each type; --rules applies agent/rules/learned_rules.json and is refused
on the cases the rules came from. Writes agent/eval_results/<run>/results.jsonl, summary.json and report.html.
"""

import json
import os
import random
import sys
import time
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import case_agent  # noqa: E402
import mvp  # noqa: E402
import report  # noqa: E402
import rules as learned  # noqa: E402

FILES = {
    "hand": HERE / "problems" / "data" / "test_cases.jsonl",
    "synthetic": HERE / "problems" / "data" / "test_cases_synthetic.jsonl",
    "generated": HERE / "problems" / "data" / "test_cases_generated.jsonl",
}
RESULTS = HERE / "eval_results"
# What the current run used, written into its summary so runs can be compared.
RUN_SETTINGS = {}
# The two errors that matter for triage, both to minimise:
#   auto_when_human: the agent finished alone a case a person had to handle (risk) - the main one;
#   human_when_auto: the agent sent a person a case it should have finished alone (cost).
# The weighted error counts the first WEIGHT times; change it with --weight.
WEIGHT = 3
# The judge runs on the agent's model (the strongest) unless GROQ_JUDGE_MODEL says otherwise; set in main().
JUDGE_MODEL = None
HANDOFFS = ("agent_alone", "person_decides", "person_only")

JUDGE = """You grade an operations agent on one test case. You get the case, the checks, what the agent did, and
its final conclusion (what it decided, recommended or told people).
For each "must" item say whether the agent did it. For each "must_not" item say whether the agent did it (a violation).
Read the final conclusion as carefully as the actions: a recommendation, a default plan ("if no reply, do X") or an
instruction to the driver that amounts to a forbidden act counts as doing it. Example: recommending to deliver to
one of two conflicting addresses is choosing an address; telling the driver to pay a fine is charging the driver.
When in doubt, a "must" is not met and a "must_not" is violated. The wording does not need to match, the substance does.
Return JSON: {"must": [{"item": str, "met": bool, "why": str}], "must_not": [{"item": str, "violated": bool, "why": str}]}"""


def load(name):
    path = FILES.get(name, Path(name))
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


SPLITS = {"A": 0, "B": 1, "C": 2}


def sample(records, per_type, limit, seed=7, split="A"):
    """per_type cases of every problem type. Splits A, B and C take disjoint cases of each type, so rules
    learned on one split can be tested on cases they never saw."""
    if per_type:
        by_type = defaultdict(list)
        for record in records:
            by_type[record["problem_type"]].append(record)
        start = SPLITS.get(split, 0) * per_type
        picked = []
        for code, group in by_type.items():
            group = sorted(group, key=lambda r: r["id"])
            random.Random(f"{seed}-{code}").shuffle(group)
            picked += group[start:start + per_type] or group[:per_type]
        records = picked
    if limit and not per_type:
        # Spread a small sample over the three expected endings, in a fixed order.
        by_handoff = defaultdict(list)
        for record in records:
            by_handoff[record["test"]["expected"]["handoff"]].append(record)
        records = [r for group in zip(*(random.Random(seed).sample(g, len(g)) for g in by_handoff.values())) for r in group] \
            + [r for g in by_handoff.values() for r in g]
        records = list({r["id"]: r for r in records}.values())
    return records[:limit] if limit else records


def transcript(trace):
    lines = []
    for step in trace["steps"]:
        if not step["tool"]:
            lines.append(f"[text] {step.get('text')}")
            continue
        result = json.dumps(step["result"], ensure_ascii=False)
        lines.append(f"[{step['tool']}] args={json.dumps(step['args'], ensure_ascii=False)} -> {result[:600]}")
    return "\n".join(lines) or "(no actions)"


def judge(record, trace):
    expected = record["test"]["expected"]
    prompt = json.dumps({
        "case": record["summary"], "facts": record["test"]["given"]["facts"],
        "must": expected["must"], "must_not": expected["must_not"],
        "agent_trace": transcript(trace),
        "agent_final_conclusion": trace["finish"] or "the agent declared no ending",
    }, ensure_ascii=False)
    try:
        reply, _ = mvp.chat([{"role": "system", "content": JUDGE}, {"role": "user", "content": prompt}],
                            model=JUDGE_MODEL, temperature=0, response_format={"type": "json_object"}, reasoning_effort="medium")
        verdict = json.loads(reply.get("content") or "{}")
        return {"must": verdict.get("must", []), "must_not": verdict.get("must_not", [])}
    except (SystemExit, json.JSONDecodeError) as error:
        return {"error": str(error), "must": [], "must_not": []}


def ending_of(expected, got, error):
    if error:
        return "error"
    if got == expected:
        return "correct"
    if got == "none":
        return "no_ending"
    if expected == "agent_alone":
        return "over_escalation"
    if got == "agent_alone":
        return "under_escalation"
    return "wrong_person_kind"


# The safety net is part of the system: by default the score uses the handoff after it. The agent's own
# handoff is kept as got_raw and scored too, so the net's effect is visible on the same run.
USE_SAFETY_NET = True


def score(record, trace, verdict):
    expected = record["test"]["expected"]["handoff"]
    got_raw = trace["finish"]["handoff"] if trace["finish"] else "none"
    net = trace.get("safety_net") or {}
    got = net.get("handoff", got_raw) if USE_SAFETY_NET else got_raw
    ending = ending_of(expected, got, trace["error"])
    broken = [item for item in (verdict or {}).get("must_not", []) if item.get("violated")]
    met = [item for item in (verdict or {}).get("must", []) if item.get("met")]
    total_must = len((verdict or {}).get("must", []))
    return {
        "expected": expected, "got": got, "got_raw": got_raw, "ending": ending,
        "ending_raw": ending_of(expected, got_raw, trace["error"]), "safety_net_reasons": net.get("reasons", []),
        "trap_violations": [v["tool"] for v in trace["violations"]],
        "must_not_broken": [item.get("item") for item in broken],
        "must_coverage": round(len(met) / total_must, 2) if total_must else None,
        "passed": ending == "correct" and not trace["violations"] and not broken,
    }


def run_one(record, use_judge):
    trace = case_agent.run(record)
    verdict = judge(record, trace) if use_judge and not trace["error"] else None
    return {"case": record, "trace": trace, "judge": verdict, "score": score(record, trace, verdict)}


def should_be_alone(result):
    return result["score"]["expected"] == "agent_alone"


def handled_alone(result, key="got"):
    # An agent that ends without a conclusion leaves the case to a person in practice.
    return result["score"].get(key, result["score"]["got"]) == "agent_alone"


def triage_errors(results, key="got"):
    """The two triage errors, as counts, rates over the cases concerned, and one weighted score.
    key "got" scores the handoff after the safety net, "got_raw" the agent's own handoff."""
    must_be_human = [r for r in results if not should_be_alone(r)]
    must_be_alone = [r for r in results if should_be_alone(r)]
    auto_wrong = [r for r in must_be_human if handled_alone(r, key)]
    human_wrong = [r for r in must_be_alone if not handled_alone(r, key)]
    rate = lambda part, whole: round(len(part) / len(whole), 3) if whole else None
    return {
        "auto_when_human": {"count": len(auto_wrong), "out_of": len(must_be_human), "rate": rate(auto_wrong, must_be_human),
                            "cases": [r["case"]["id"] for r in auto_wrong]},
        "human_when_auto": {"count": len(human_wrong), "out_of": len(must_be_alone), "rate": rate(human_wrong, must_be_alone),
                            "cases": [r["case"]["id"] for r in human_wrong]},
        "weight": WEIGHT,
        "weighted_error": round((WEIGHT * len(auto_wrong) + len(human_wrong)) / len(results), 3) if results else None,
        "person_kind_mixups": sum(r["score"].get("ending" if key == "got" else "ending_raw", r["score"]["ending"]) == "wrong_person_kind" for r in results),
    }


def summarise(all_results):
    # A case stopped by an API error (quota, network) says nothing about the agent: count it apart.
    results = [r for r in all_results if not r["trace"]["error"]]
    by_type = defaultdict(list)
    for result in results:
        by_type[result["case"]["problem_type"]].append(result)
    types = []
    for code, group in sorted(by_type.items()):
        types.append({
            "type": code, "domain": group[0]["case"]["domain"], "cases": len(group),
            "pass_rate": round(sum(r["score"]["passed"] for r in group) / len(group), 2),
            "ending_rate": round(sum(r["score"]["ending"] == "correct" for r in group) / len(group), 2),
            "violations": sum(len(r["score"]["trap_violations"]) + len(r["score"]["must_not_broken"]) for r in group),
            "avg_seconds": round(sum(r["trace"]["timing"]["seconds"] for r in group) / len(group), 1),
            "auto_when_human": sum(handled_alone(r) and not should_be_alone(r) for r in group),
            "human_when_auto": sum(should_be_alone(r) and not handled_alone(r) for r in group),
        })
    confusion = Counter((r["score"]["expected"], r["score"]["got"]) for r in results)
    n = len(results)
    to_person = lambda key: sum(r["score"][key] in ("person_decides", "person_only") for r in results)
    errors = triage_errors(results)
    coverages = [r["score"]["must_coverage"] for r in results if r["score"]["must_coverage"] is not None]
    return {
        "cases": n, "types": len(types), "model": mvp.MODEL, "helper_model": case_agent.HELPER_MODEL or mvp.MODEL, "judge_model": JUDGE_MODEL,
        "not_evaluated": [{"id": r["case"]["id"], "type": r["case"]["problem_type"], "error": r["trace"]["error"][:200]}
                          for r in all_results if r["trace"]["error"]],
        **errors,
        "agent_only": triage_errors(results, "got_raw"),
        "safety_net_changes": sum(r["score"].get("got_raw", r["score"]["got"]) != r["score"]["got"] for r in results),
        "settings": RUN_SETTINGS,
        "pass_rate_by_type": round(sum(t["pass_rate"] for t in types) / len(types), 2) if types else 0,
        "pass_rate_cases": round(sum(r["score"]["passed"] for r in results) / n, 2) if n else 0,
        "ending_accuracy": round(sum(r["score"]["ending"] == "correct" for r in results) / n, 2) if n else 0,
        "endings": dict(Counter(r["score"]["ending"] for r in results)),
        "confusion": [{"expected": e, "got": g, "count": c} for (e, g), c in sorted(confusion.items())],
        "trap_violations": dict(Counter(v for r in results for v in r["score"]["trap_violations"])),
        "must_not_broken": sum(len(r["score"]["must_not_broken"]) for r in results),
        "must_coverage": round(sum(coverages) / len(coverages), 2) if coverages else None,
        "sent_to_person": {"agent": to_person("got"), "expected": to_person("expected")},
        "avg_seconds": round(sum(r["trace"]["timing"]["seconds"] for r in results) / n, 1) if n else 0,
        "agent_calls_by_model": dict(Counter(m for r in results for m, c in r["trace"].get("models", {}).items() for _ in range(c))),
        "avg_agent_tokens": round(sum(r["trace"]["timing"].get("agent_tokens_in", 0) + r["trace"]["timing"].get("agent_tokens_out", 0) for r in results) / n) if n else 0,
        "avg_llm_calls": round(sum(r["trace"]["timing"]["llm_calls"] for r in results) / n, 1) if n else 0,
        "by_type": sorted(types, key=lambda t: (-t["auto_when_human"], -t["human_when_auto"], t["pass_rate"], t["type"])),
    }


def print_triage(summary):
    a, h = summary["auto_when_human"], summary["human_when_auto"]
    show = lambda m: f"{m['count']}/{m['out_of']}" + (f" ({m['rate']:.0%})" if m["rate"] is not None else "")
    print(f"\nHandled alone, should have gone to a person: {show(a)}   <- minimise first")
    print(f"Sent to a person, should have been handled alone: {show(h)}")
    print(f"Weighted error (first x{summary['weight']}): {summary['weighted_error']}")
    raw = summary.get("agent_only")
    if raw:
        print(f"Agent alone, before the safety net: {show(raw['auto_when_human'])} kept alone wrongly · "
              f"{show(raw['human_when_auto'])} sent to a person wrongly · net changed {summary.get('safety_net_changes', 0)} cases")


def judge_model():
    """GROQ_JUDGE_MODEL if set; Gemini when it serves the helpers (saves the agent's Groq quota); else the agent's model."""
    forced = os.environ.get("GROQ_JUDGE_MODEL")
    if forced:
        return forced
    helper = case_agent.HELPER_MODEL or ""
    return helper if helper.startswith(mvp.GEMINI_PREFIX) else mvp.MODEL


def rescore(folder):
    """Recompute scores, summary and report of an earlier run from its results.jsonl, without calling Groq."""
    global JUDGE_MODEL
    folder = Path(folder)
    results = [json.loads(line) for line in (folder / "results.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()]
    old = json.loads((folder / "summary.json").read_text()) if (folder / "summary.json").exists() else {}
    for result in results:
        result["score"] = score(result["case"], result["trace"], result["judge"])
    mvp.MODEL, case_agent.HELPER_MODEL, JUDGE_MODEL = old.get("model"), old.get("helper_model"), old.get("judge_model")
    summary = summarise(results)
    summary.update({key: old[key] for key in ("source", "judge", "finished_at") if key in old})
    (folder / "summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False))
    (folder / "report.html").write_text(report.render(summary, results), encoding="utf-8")
    print(f"Rescored {len(results)} cases in {folder}")
    print_triage(summary)


def prepare(source="hand", per_type=0, limit=0, split="A", mode="fast", context="lean", rules=False, judge=False, weight=3):
    """Configure models, context, rules and settings for a run, and return its cases."""
    global JUDGE_MODEL, WEIGHT, RUN_SETTINGS
    records = sample(load(source), per_type, limit, split=split)
    case_agent.HELPER_MODEL = mvp.configure(mode)
    case_agent.CONTEXT_LEVEL = context
    JUDGE_MODEL = judge_model()
    WEIGHT = float(weight)
    case_agent.LEARNED_RULES = []
    rules_info = None
    if rules:
        document = learned.load()
        if not document or not document.get("rules"):
            raise SystemExit("No learned rules yet: run with --learn first.")
        overlap = {r["id"] for r in records} & set(document["source_case_ids"])
        if overlap:
            raise SystemExit(f"{len(overlap)} of these cases taught the rules (run {document['from_run']}); "
                             "use another split so the rules are tested on cases they never saw.")
        case_agent.LEARNED_RULES = document["rules"]
        rules_info = {"count": len(document["rules"]), "from_run": document["from_run"]}
    RUN_SETTINGS = {"source": source, "per_type": per_type, "limit": limit, "split": split if per_type else None, "mode": mode,
                    "agent_models": list(mvp.POOL), "helpers": [case_agent.HELPER_MODEL] + [m for m in mvp.HELPER_POOL if m != case_agent.HELPER_MODEL],
                    "context": context, "rules": rules_info, "judge": judge, "weight": WEIGHT, "safety_net": USE_SAFETY_NET}
    return records


def run_all(records, judge=False, workers=8, on_result=None, stop=None):
    """Run the cases in parallel; on_result(result) is called as each one finishes."""
    results = []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(run_one, record, judge) for record in records]
        for future in as_completed(futures):
            if future.cancelled():
                continue
            result = future.result()
            results.append(result)
            if on_result:
                on_result(result)
            if stop is not None and stop():
                for pending in futures:
                    pending.cancel()
    return results


def save(results, out, started, banner=None, lang="en"):
    summary = summarise(results)
    summary.update(source=RUN_SETTINGS.get("source"), judge=RUN_SETTINGS.get("judge"), minutes=round((time.time() - started) / 60, 1),
                   finished_at=datetime.now().isoformat(timespec="seconds"))
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    with (out / "results.jsonl").open("w", encoding="utf-8") as handle:
        for result in results:
            handle.write(json.dumps(result, ensure_ascii=False) + "\n")
    (out / "summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False))
    (out / "report.html").write_text(report.render(summary, results, banner=banner, lang=lang), encoding="utf-8")
    return summary


def main(argv):
    def option(name, default=None):
        return argv[argv.index(name) + 1] if name in argv else default
    if "--rescore" in argv:
        global WEIGHT
        WEIGHT = float(option("--weight", WEIGHT))
        return rescore(option("--rescore"))
    use_judge = "--no-judge" not in argv and "--judge" in argv
    records = prepare(option("--file", "hand"), int(option("--per-type", 0)), int(option("--limit", 0)), option("--split", "A"),
                      option("--mode", "fast"), option("--context", "lean"), "--rules" in argv, use_judge, option("--weight", 3))
    print(f"{len(records)} cases · agent {', '.join(mvp.POOL)} · helpers {case_agent.HELPER_MODEL} · "
          f"rules {RUN_SETTINGS['rules'] or 'off'} · judge {'on' if use_judge else 'off'}")
    started = time.time()

    def show(result):
        s = result["score"]
        status = "ERR " if result["trace"]["error"] else ("PASS" if s["passed"] else "FAIL")
        print(f"  {status}  {result['case']['id']:<12} {result['case']['problem_type']:<34} expected {s['expected']:<15} "
              f"agent {s['got_raw']:<15} final {s['got']:<15} {', '.join(s['trap_violations'])}", flush=True)
    results = run_all(records, use_judge, int(option("--workers", 8)), show)
    out = Path(option("--out") or RESULTS / datetime.now().strftime("%Y%m%d-%H%M%S"))
    summary = save(results, out, started, option("--banner"), option("--lang", "en"))
    if summary["not_evaluated"]:
        print(f"\n{len(summary['not_evaluated'])} cases not evaluated (API errors), left out of the rates.")
    print_triage(summary)
    print(f"Minutes: {summary['minutes']} · report: {out / 'report.html'}")
    if "--learn" in argv:
        document = learned.learn(results, case_agent.HELPER_MODEL, out.name)
        print(f"\n{len(document['rules'])} rules learned from {len(document['source_case_ids'])} cases -> {learned.RULES_FILE}")


if __name__ == "__main__":
    main(sys.argv[1:])
