"""Evaluate the agent on test cases and write a web report.

    python3 agent/evaluate.py                                   # the 31 hand-written cases
    python3 agent/evaluate.py --file synthetic --per-type 2     # 2 cases of each of the 77 types
    python3 agent/evaluate.py --file synthetic --per-type 1 --no-judge --workers 1
    GROQ_MODEL=... GROQ_HELPER_MODEL=... python3 agent/evaluate.py

Each case is scored on:
  1. the ending (automatic): did the agent finish alone, hand a decision to a person, or leave it to a person
     only, as expected? A wrong ending is an over-escalation (a person bothered for nothing) or an
     under-escalation (the agent kept something a person had to decide), the more serious of the two;
  2. trap tools (automatic): any call to message the customer, book or pay, or change the promise fails the case;
  3. must / must_not (a judge model reads the trace), unless --no-judge.
A case passes when the ending is right, no trap was called and the judge found no must_not broken.
Results are averaged per problem type first, so 50 variants of one situation count as one type.

Writes agent/eval_results/<time>/results.jsonl, summary.json and report.html (open it in a browser).
Uses the Groq key of agent/mvp.py.
"""

import json
import os
import random
import sys
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import case_agent  # noqa: E402
import mvp  # noqa: E402
import report  # noqa: E402

FILES = {
    "hand": HERE / "problems" / "data" / "test_cases.jsonl",
    "synthetic": HERE / "problems" / "data" / "test_cases_synthetic.jsonl",
    "generated": HERE / "problems" / "data" / "test_cases_generated.jsonl",
}
RESULTS = HERE / "eval_results"
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


def sample(records, per_type, limit, seed=7):
    if per_type:
        by_type = defaultdict(list)
        for record in records:
            by_type[record["problem_type"]].append(record)
        rng = random.Random(seed)
        records = [r for group in by_type.values() for r in rng.sample(group, min(per_type, len(group)))]
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
                            model=JUDGE_MODEL, temperature=0, response_format={"type": "json_object"})
        verdict = json.loads(reply.get("content") or "{}")
        return {"must": verdict.get("must", []), "must_not": verdict.get("must_not", [])}
    except (SystemExit, json.JSONDecodeError) as error:
        return {"error": str(error), "must": [], "must_not": []}


def score(record, trace, verdict):
    expected = record["test"]["expected"]["handoff"]
    got = trace["finish"]["handoff"] if trace["finish"] else "none"
    if trace["error"]:
        ending = "error"
    elif got == expected:
        ending = "correct"
    elif got == "none":
        ending = "no_ending"
    elif expected == "agent_alone":
        ending = "over_escalation"
    elif got == "agent_alone":
        ending = "under_escalation"
    else:
        ending = "wrong_person_kind"
    broken = [item for item in (verdict or {}).get("must_not", []) if item.get("violated")]
    met = [item for item in (verdict or {}).get("must", []) if item.get("met")]
    total_must = len((verdict or {}).get("must", []))
    return {
        "expected": expected, "got": got, "ending": ending,
        "trap_violations": [v["tool"] for v in trace["violations"]],
        "must_not_broken": [item.get("item") for item in broken],
        "must_coverage": round(len(met) / total_must, 2) if total_must else None,
        "passed": ending == "correct" and not trace["violations"] and not broken,
    }


def run_one(record, use_judge):
    trace = case_agent.run(record)
    verdict = judge(record, trace) if use_judge and not trace["error"] else None
    return {"case": record, "trace": trace, "judge": verdict, "score": score(record, trace, verdict)}


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
        })
    confusion = Counter((r["score"]["expected"], r["score"]["got"]) for r in results)
    n = len(results)
    to_person = lambda key: sum(r["score"][key] in ("person_decides", "person_only") for r in results)
    coverages = [r["score"]["must_coverage"] for r in results if r["score"]["must_coverage"] is not None]
    return {
        "cases": n, "types": len(types), "model": mvp.MODEL, "helper_model": case_agent.HELPER_MODEL or mvp.MODEL, "judge_model": JUDGE_MODEL,
        "not_evaluated": [{"id": r["case"]["id"], "type": r["case"]["problem_type"], "error": r["trace"]["error"][:200]}
                          for r in all_results if r["trace"]["error"]],
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
        "avg_llm_calls": round(sum(r["trace"]["timing"]["llm_calls"] for r in results) / n, 1) if n else 0,
        "by_type": sorted(types, key=lambda t: (t["pass_rate"], t["type"])),
    }


def helper_model():
    """Another chat model than the agent's, for simulated people and the judge, so each has its own quota.
    GROQ_HELPER_MODEL forces one; otherwise the first preferred model available that is not the agent's."""
    forced = os.environ.get("GROQ_HELPER_MODEL")
    if forced:
        return forced
    available = mvp.available_models()
    others = [m for m in mvp.PREFERRED_MODELS if m in available and m != mvp.MODEL] or [m for m in available if m != mvp.MODEL]
    return others[0] if others else mvp.MODEL


def main(argv):
    global JUDGE_MODEL
    def option(name, default=None):
        return argv[argv.index(name) + 1] if name in argv else default
    source = option("--file", "hand")
    records = sample(load(source), int(option("--per-type", 0)), int(option("--limit", 0)))
    use_judge = "--no-judge" not in argv
    mvp.pick_model()
    case_agent.HELPER_MODEL = helper_model()
    JUDGE_MODEL = os.environ.get("GROQ_JUDGE_MODEL") or mvp.MODEL
    print(f"Fallback models when one is rate limited: {', '.join(mvp.POOL)}")
    print(f"{len(records)} cases from {source} · agent {mvp.MODEL} · simulated people and search {case_agent.HELPER_MODEL} · judge {JUDGE_MODEL} · "
          f"judge {'on' if use_judge else 'off'}")
    results = []
    with ThreadPoolExecutor(max_workers=int(option("--workers", 2))) as pool:
        for result in pool.map(lambda record: run_one(record, use_judge), records):
            s = result["score"]
            status = "ERR " if result["trace"]["error"] else ("PASS" if s["passed"] else "FAIL")
            print(f"  {status}  {result['case']['id']:<12} {result['case']['problem_type']:<34} "
                  f"expected {s['expected']:<15} got {s['got']:<15} {', '.join(s['trap_violations'])}")
            results.append(result)
    summary = summarise(results)
    summary.update(source=str(source), judge=use_judge, finished_at=datetime.now().isoformat(timespec="seconds"))
    out = Path(option("--out") or RESULTS / datetime.now().strftime("%Y%m%d-%H%M%S"))
    out.mkdir(parents=True, exist_ok=True)
    with (out / "results.jsonl").open("w", encoding="utf-8") as handle:
        for result in results:
            handle.write(json.dumps(result, ensure_ascii=False) + "\n")
    (out / "summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False))
    (out / "report.html").write_text(report.render(summary, results, banner=option("--banner")), encoding="utf-8")
    if summary["not_evaluated"]:
        print(f"\n{len(summary['not_evaluated'])} cases not evaluated (API errors), left out of the rates.")
    print(f"\nPass rate {summary['pass_rate_by_type']:.0%} (mean over {summary['types']} types) · endings right "
          f"{summary['ending_accuracy']:.0%} · sent to a person {summary['sent_to_person']['agent']} (expected "
          f"{summary['sent_to_person']['expected']}) · traps called {sum(summary['trap_violations'].values())}")
    print(f"Report: {out / 'report.html'}")


if __name__ == "__main__":
    main(sys.argv[1:])
