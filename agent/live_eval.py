"""Live evaluation page: start a run or the full rules experiment and watch the metrics update case by case.

    python3 agent/live_eval.py            # then open http://127.0.0.1:8765
    python3 agent/live_eval.py --port 9000

Standard library only. Runs on this computer only (127.0.0.1). Uses the Groq and Gemini keys of agent/mvp.py.
Each run writes its report to agent/eval_results/live-<time>/. English by default, French with the FR button.

The experiment: split A without learned rules -> learn rules from A -> split B with the rules -> split B
without the rules (control). Splits take different cases of the same 77 problem types, so the rules are
never scored on the cases they came from, and the control shows whether a change comes from the rules.
"""

import json
import sys
import threading
import time
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import case_agent  # noqa: E402
import evaluate  # noqa: E402
import mvp  # noqa: E402
import rules as learned  # noqa: E402

STATE = {"running": False}
LOCK = threading.Lock()
STOP = threading.Event()


def comparison():
    """Earlier runs with their settings and the two triage errors, newest first."""
    rows = []
    for folder in sorted(evaluate.RESULTS.glob("*/summary.json"), reverse=True):
        try:
            s = json.loads(folder.read_text())
        except (OSError, json.JSONDecodeError):
            continue
        settings = s.get("settings") or {}
        if not settings or "auto_when_human" not in s:
            continue
        raw = s.get("agent_only") or {}
        rows.append({
            "run": folder.parent.name, "mode": settings.get("mode"), "split": settings.get("split"),
            "rules": (settings.get("rules") or {}).get("count", 0), "cases": s["cases"], "minutes": s.get("minutes"),
            "first": s["auto_when_human"], "second": s["human_when_auto"], "other": s.get("other_failures"), "score": s.get("weighted_error"),
            "first_agent": raw.get("auto_when_human"), "score_agent": raw.get("weighted_error"),
            "not_evaluated": len(s.get("not_evaluated", [])), "finished": s.get("finished_at"),
        })
    return sorted(rows, key=lambda r: r["finished"] or "", reverse=True)[:16]


# Requests per case measured on the runs of 2026-10-25: about 2.7 agent calls and 0.7 helper calls.
AGENT_CALLS_PER_CASE, HELPER_CALLS_PER_CASE = 2.8, 0.8
# Agent tokens per case with the playbook in every call (~2,700 a call): used to price OpenRouter runs.
AGENT_TOKENS_IN_PER_CASE, AGENT_TOKENS_OUT_PER_CASE = 7_500, 400
_account = {"at": 0, "data": None}


def openrouter_account():
    """The key's credit, refreshed at most once a minute (no model call, nothing billed)."""
    if not mvp.openrouter_key():
        return None
    if time.time() - _account["at"] > 60:
        try:
            _account["data"] = mvp.openrouter_account()
        except Exception as error:  # noqa: BLE001 - shown, never blocks the page
            _account["data"] = {"error": str(error)[:120]}
        _account["at"] = time.time()
    return _account["data"]


def usage():
    """Today's use of each model against its daily limit."""
    today = mvp.usage_today()
    names = list(mvp.DAILY_LIMITS) + [m for m in today if m not in mvp.DAILY_LIMITS]
    rows = []
    for name in names:
        limit = mvp.DAILY_LIMITS.get(name) or (mvp.OPENROUTER_DAILY if name.startswith(mvp.OPENROUTER_PREFIX) else (None, None))
        used = today.get(name, {})
        rows.append({"model": name, "requests": used.get("requests", 0), "tokens": used.get("tokens", 0),
                     "limit_requests": limit[0], "limit_tokens": limit[1], "room": mvp.daily_room(name)})
    return {"day": mvp.quota_day(), "models": rows, "openrouter": {
        "spent_today_usd": round(mvp.openrouter_spent_today(), 4), "budget_usd": mvp.OPENROUTER_BUDGET_USD,
        "model": mvp.OPENROUTER_MODEL, "account": openrouter_account()} if mvp.openrouter_key() else None}


def budget_check(settings, action):
    """(ok, estimate): whether today's remaining quota covers this run or experiment."""
    mvp.configure(settings["mode"])
    cases = 77 * settings["per_type"] if settings["per_type"] else settings["count"]
    runs = 3 if action == "experiment" else (0 if action == "learn" else 1)
    learning = 1 if action in ("experiment", "learn") else 0
    agent_need = int(runs * cases * AGENT_CALLS_PER_CASE + learning * (cases + 1) * 1.05)
    helper_need = int(runs * cases * HELPER_CALLS_PER_CASE)

    def room(models):
        rooms = [mvp.daily_room(m) for m in models]
        return 10**9 if any(r is None for r in rooms) else sum(rooms)
    if settings["mode"] == "openrouter":
        price_in, price_out = mvp.OPENROUTER_PRICES.get(mvp.OPENROUTER_MODEL, (0.0, 0.0))
        dollars = runs * cases * (AGENT_TOKENS_IN_PER_CASE * price_in + AGENT_TOKENS_OUT_PER_CASE * price_out)
        left = mvp.OPENROUTER_BUDGET_USD - mvp.openrouter_spent_today()
        estimate = {"agent_requests": agent_need, "agent_room": None, "helper_requests": helper_need,
                    "helper_room": room(mvp.HELPER_POOL) if mvp.HELPER_POOL else None,
                    "usd": round(dollars, 4), "usd_left": round(left, 4), "model": mvp.OPENROUTER_MODEL}
        return dollars <= left and (estimate["helper_room"] is None or helper_need <= estimate["helper_room"]), estimate
    agent_room = room(mvp.POOL)
    helper_room = room(mvp.HELPER_POOL) if mvp.HELPER_POOL else max(0, agent_room - agent_need)
    estimate = {"agent_requests": agent_need, "agent_room": agent_room, "helper_requests": helper_need, "helper_room": helper_room}
    return agent_need <= agent_room and helper_need <= helper_room, estimate


def status():
    with LOCK:
        results = list(STATE.get("results", []))
        done, total = len(results), STATE.get("total", 0)
        started = STATE.get("run_started")
        elapsed = (time.time() - started) if started and STATE.get("running") else STATE.get("elapsed", 0)
        per_case = elapsed / done if done else None
        document = learned.load()
        return {
            "running": STATE.get("running", False), "stopping": STOP.is_set(), "phase": STATE.get("phase"),
            "experiment": STATE.get("experiment"), "done": done, "total": total, "elapsed": round(elapsed),
            "eta": round(per_case * (total - done)) if per_case and STATE.get("running") and total else None,
            "settings": STATE.get("settings"), "summary": evaluate.summarise(results) if results else None,
            "report": STATE.get("report"), "error": STATE.get("error"),
            "rules": document and {"from_run": document["from_run"], "rules": document["rules"], "created_at": document["created_at"],
                                   "cases": len(document["source_case_ids"])},
            "comparison": comparison(), "usage": usage(), "estimate": STATE.get("estimate"),
            "cases": [{
                "id": r["case"]["id"], "type": r["case"]["problem_type"], "summary": r["case"]["summary"],
                "expected": r["score"]["expected"], "got": r["score"]["got"], "got_raw": r["score"].get("got_raw", r["score"]["got"]),
                "passed": r["score"]["passed"], "seconds": r["trace"]["timing"]["seconds"], "error": bool(r["trace"]["error"]),
                "traps": r["score"]["trap_violations"], "net": r["score"].get("safety_net_reasons", []),
                "steps": r["trace"]["steps"],
                "conclusion": ((r["trace"]["finish"] or {}).get("recommendation") or (r["trace"]["finish"] or {}).get("summary") or "")[:240],
            } for r in reversed(results)],
        }


def one_run(settings, label):
    """One evaluation run with these settings; returns its folder, or None when stopped before any case."""
    records = evaluate.prepare(settings["source"], settings["per_type"], settings["count"], settings["split"], settings["mode"],
                               settings["context"], settings["rules"], settings["judge"], settings["weight"])
    with LOCK:
        STATE.update(results=[], total=len(records), run_started=time.time(), phase=label, report=None)

    def keep(result):
        daily = "daily limit" in (result["trace"]["error"] or "")
        with LOCK:
            if not daily:  # a case refused for quota says nothing about the agent
                STATE["results"].append(result)
            else:
                STATE["error"] = "daily_limit"
        if daily:
            STOP.set()
    started = time.time()
    evaluate.run_all(records, settings["judge"], settings["workers"], keep, STOP.is_set)
    with LOCK:
        results = list(STATE["results"])
        STATE["elapsed"] = time.time() - started
    if not results:
        return None
    slug = "".join(c if c.isalnum() else "-" for c in label).strip("-")
    out = evaluate.RESULTS / f"live-{datetime.now().strftime('%Y%m%d-%H%M%S')}-{slug}"
    evaluate.save(results, out, started, lang=settings["lang"])
    with LOCK:
        STATE["report"] = out.name
    return out


def learn_from(folder):
    with LOCK:
        STATE.update(phase="learn")
    results = [json.loads(line) for line in (folder / "results.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()]
    # The agent's models are idle while rules are written and faster; on OpenRouter the agent's model is paid,
    # so the free helper models write the rules instead.
    writer = case_agent.HELPER_MODEL if STATE["settings"]["mode"] == "openrouter" else mvp.MODEL
    return learned.learn(results, writer, folder.name)


def worker(settings, action):
    try:
        if action == "run":
            one_run(settings, "run")
        elif action == "learn":
            folder = latest_run()
            if not folder:
                raise SystemExit("No run to learn from yet.")
            case_agent.HELPER_MODEL = mvp.configure(settings["mode"])
            learn_from(folder)
        elif action == "experiment":
            test = settings["split"] if settings["split"] != "A" else "B"  # the rules are tested on another split
            steps = [("A", False, "A"), ("learn", None, "learn"), (test, True, f"{test}+rules"), (test, False, f"{test} control")]
            first = None
            for index, (split, rules, label) in enumerate(steps, 1):
                if STOP.is_set():
                    break
                with LOCK:
                    STATE["experiment"] = {"step": index, "of": len(steps), "label": label}
                if split == "learn":
                    if not first:
                        break
                    learn_from(first)
                    continue
                folder = one_run({**settings, "split": split, "rules": rules}, label)
                if split == "A" and not rules:
                    first = folder
    except BaseException as error:  # noqa: BLE001 - shown on the page, the server keeps running
        with LOCK:
            STATE["error"] = str(error)
    finally:
        with LOCK:
            STATE["running"], STATE["phase"] = False, None


def latest_run():
    runs = sorted(evaluate.RESULTS.glob("live-*/results.jsonl"))
    return runs[-1].parent if runs else None


def start(body, action):
    try:
        settings = {
            "source": body.get("source") if body.get("source") in evaluate.FILES else "synthetic",
            "count": max(0, min(int(body.get("count", 0)), 5000)),
            "per_type": max(0, min(int(body.get("per_type", 1)), 50)),
            "split": body.get("split") if body.get("split") in evaluate.SPLITS else "A",
            "workers": max(1, min(int(body.get("workers", 8)), 16)),
            "judge": bool(body.get("judge", False)),
            "weight": max(1.0, min(float(body.get("weight", 3)), 20.0)),
            "context": "full" if body.get("context") == "full" else "lean",
            "mode": body.get("mode") if body.get("mode") in ("groq", "openrouter") else "fast",
            "rules": bool(body.get("rules", False)),
            "lang": "fr" if body.get("lang") == "fr" else "en",
        }
    except (TypeError, ValueError):
        return 400, {"error": "Invalid settings"}
    if settings["per_type"]:
        settings["count"] = 0
    with LOCK:
        if STATE.get("running"):
            return 409, {"error": "A run is already in progress"}
    try:
        ok, estimate = budget_check(settings, action)
    except SystemExit as error:
        return 400, {"error": str(error)}
    if not ok:
        return 409, {"error": "budget", "estimate": estimate}
    with LOCK:
        STOP.clear()
        STATE.clear()
        STATE.update(running=True, results=[], settings=settings, total=0, phase=action, estimate=estimate)
    threading.Thread(target=worker, args=(settings, action), daemon=True).start()
    return 202, {"ok": True}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def send(self, code, payload, kind="application/json"):
        data = payload.encode() if isinstance(payload, str) else json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", f"{kind}; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/":
            return self.send(200, PAGE.replace("</style>", (HERE / "live_eval.css").read_text() + "</style>", 1), "text/html")
        if self.path == "/api/status":
            return self.send(200, status())
        if self.path.startswith("/report/"):
            name = self.path.split("/")[2]
            path = evaluate.RESULTS / name / "report.html"
            if name and "/" not in name and ".." not in name and path.exists():
                return self.send(200, path.read_text(encoding="utf-8"), "text/html")
        if self.path == "/report":
            with LOCK:
                name = STATE.get("report")
            path = evaluate.RESULTS / name / "report.html" if name else None
            if path and path.exists():
                return self.send(200, path.read_text(encoding="utf-8"), "text/html")
        self.send(404, {"error": "Not found"})

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            return self.send(400, {"error": "Invalid JSON"})
        if self.path in ("/api/start", "/api/learn", "/api/experiment"):
            return self.send(*start(body, {"/api/start": "run", "/api/learn": "learn", "/api/experiment": "experiment"}[self.path]))
        if self.path == "/api/stop":
            STOP.set()
            return self.send(202, {"ok": True})
        self.send(404, {"error": "Not found"})


PAGE = r"""<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>Live agent evaluation</title><style>
:root{--bg:#fbfaf6;--card:#fff;--ink:#16140f;--muted:#6d6656;--hair:#e7e2d7;--ok:#1b7a52;--ok-bg:#e8f5ee;--bad:#b42c42;--bad-bg:#fdeef0;
--warn:#a5520f;--warn-bg:#fdf1e7;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#15140f;--card:#1e1c16;--ink:#f1eee6;--muted:#a49d8c;--hair:#34312a;--ok:#5fc795;--ok-bg:#16301f;
--bad:#f07a8c;--bad-bg:#3a1a20;--warn:#f0a35e;--warn-bg:#382513;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:1120px;margin:0 auto;padding:28px 16px 64px}h1{font-size:26px;margin:0}h2{font-size:17px;margin:28px 0 10px}.sub{color:var(--muted)}
.top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.lang button{font:inherit;font-size:13px;border:1px solid var(--hair);background:var(--card);color:var(--ink);border-radius:99px;padding:4px 10px;cursor:pointer}
.lang button[aria-pressed=true]{background:var(--ink);color:var(--bg)}
form{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;align-items:end;background:var(--card);border:1px solid var(--hair);border-radius:14px;padding:16px;margin-top:18px}
label{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--muted)}input,select{font:inherit;color:var(--ink);background:var(--bg);border:1px solid var(--hair);border-radius:8px;padding:7px 9px}
.check{flex-direction:row;align-items:center;gap:8px}.buttons{display:flex;gap:8px;flex-wrap:wrap;grid-column:1/-1}button.b{font:inherit;border-radius:8px;padding:8px 14px;border:1px solid var(--ink);cursor:pointer;background:transparent;color:var(--ink)}
button.go{background:var(--ink);color:var(--bg)}button:disabled{opacity:.4;cursor:default}
.progress{margin-top:16px;background:var(--card);border:1px solid var(--hair);border-radius:14px;padding:14px 16px}
.bar{height:10px;background:var(--hair);border-radius:6px;overflow:hidden;margin:8px 0}.bar i{display:block;height:100%;background:var(--ink);transition:width .4s}
.row{display:flex;gap:18px;flex-wrap:wrap;color:var(--muted);font-size:13px}.row b{color:var(--ink);font-variant-numeric:tabular-nums}
.triage{display:grid;grid-template-columns:1.3fr 1fr 1fr;gap:12px;margin-top:16px}@media (max-width:760px){.triage{grid-template-columns:1fr}}
.metric{border-radius:14px;padding:16px;border:1px solid var(--hair);background:var(--card);display:flex;flex-direction:column;gap:4px}
.metric .k{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}.metric b{font-size:34px;font-variant-numeric:tabular-nums}
.metric b small{font-size:16px;color:var(--muted);font-weight:500}.metric em{font-style:normal;font-weight:700}.metric .d{color:var(--muted);font-size:13px}
.metric.main{border:2px solid var(--bad);background:var(--bad-bg)}.metric.main b,.metric.main em{color:var(--bad)}.metric.second{border-color:var(--warn)}.metric.second em{color:var(--warn)}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-top:12px}.tile{background:var(--card);border:1px solid var(--hair);border-radius:12px;padding:12px}
.tile b{display:block;font-size:22px;font-variant-numeric:tabular-nums}.tile span{color:var(--muted);font-size:13px}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--hair);border-radius:12px;overflow:hidden}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--hair);vertical-align:top;font-size:14px;font-variant-numeric:tabular-nums}th{font-size:12px;color:var(--muted)}
.pill{display:inline-block;padding:1px 8px;border-radius:99px;font-size:12px;font-weight:700;white-space:nowrap}.ok{background:var(--ok-bg);color:var(--ok)}
.bad{background:var(--bad-bg);color:var(--bad)}.warn{background:var(--warn-bg);color:var(--warn)}.mute{color:var(--muted)}.small{font-size:12px;color:var(--muted)}
.empty{color:var(--muted);padding:28px;text-align:center;background:var(--card);border:1px dashed var(--hair);border-radius:12px}.err{color:var(--bad);font-weight:600;margin-top:10px}
.rules{background:var(--card);border:1px solid var(--hair);border-radius:12px;padding:12px 16px}.rules li{margin:4px 0}a{color:inherit}
</style></head><body><main>
<div class=top><div><h1 data-t=title></h1><div class=sub data-t=intro></div></div>
<div class=lang><button data-l=en>EN</button> <button data-l=fr>FR</button></div></div>
<form id=f>
<label><span data-t=mode></span><select name=mode><option value=fast data-t=mode_fast></option><option value=groq data-t=mode_groq></option><option value=openrouter data-t=mode_or></option></select></label>
<label><span data-t=source></span><select name=source><option value=synthetic data-t=src_syn></option><option value=hand data-t=src_hand></option><option value=generated data-t=src_gen></option></select></label>
<label><span data-t=per_type></span><input name=per_type type=number min=0 max=50 value=1></label>
<label><span data-t=count></span><input name=count type=number min=0 max=5000 value=0></label>
<label><span data-t=split></span><select name=split><option>A</option><option>B</option><option>C</option></select></label>
<label><span data-t=workers></span><input name=workers type=number min=1 max=16 value=8></label>
<label><span data-t=weight></span><input name=weight type=number min=1 max=20 step=0.5 value=3></label>
<label><span data-t=context></span><select name=context><option value=lean data-t=ctx_lean></option><option value=full data-t=ctx_full></option></select></label>
<label class=check><input name=rules type=checkbox> <span data-t=use_rules></span></label>
<label class=check><input name=judge type=checkbox> <span data-t=judge></span></label>
<div class=buttons><button class="b go" id=go type=submit data-t=run></button><button class=b id=exp type=button data-t=experiment></button>
<button class=b id=learn type=button data-t=learn></button><button class=b id=stop type=button disabled data-t=stop></button></div>
</form>
<div id=err class=err></div>
<div id=live></div>
<script>
const T={en:{title:"Live agent evaluation",intro:"Pick the cases, start, and follow the metrics while the cases run. Nothing real is sent or booked.",
mode:"Agent model",mode_fast:"Fast: Gemini Flash Lite (77 cases in ~5-7 min)",mode_groq:"gpt-oss-120b on Groq (slow on the free tier)",mode_or:"OpenRouter (model in OPENROUTER_MODEL)",
usage_h:"Today's quota use",usage_day:"quota day",model_c:"Model",used_c:"Requests used",limit_c:"Daily limit",room_c:"Left (after the 5 % margin)",
budget:"Not enough quota left today for this run",of_cap:"under the evaluation cap",or_h:"OpenRouter credit",or_spent:"spent today by evaluations",or_cap:"evaluation cap",or_key:"key: used",or_left:"left on the key",need:"needs about",have:"left",agent_w:"agent",helper_w:"helpers",estimate:"Estimated use of this run",
source:"Case set",src_syn:"Synthetic (3,850, 77 types)",src_hand:"Hand-written (31)",src_gen:"Generated by Groq",
per_type:"Cases per type",count:"…or number of cases (when per type is 0)",split:"Split (different cases of each type)",workers:"In parallel",
weight:"Weight of the main error",context:"Agent context",ctx_lean:"Lean (cheaper)",ctx_full:"Full (triage playbook + Bahn guide)",
use_rules:"Apply learned rules (refused on the cases they came from)",judge:"Judge (must / must not): one more call per case, not needed for the two triage errors",
run:"Run",experiment:"Run full experiment (A → learn → chosen split with rules → without)",learn:"Learn rules from the last run",stop:"Stop",
done:"cases finished",evaluated:"evaluated",not_eval:"not evaluated (API error, left out of the rates)",elapsed:"elapsed",left:"about",
left2:"left",running:"running",stopping:"stopping…",finished:"finished",step:"Experiment step",open_report:"Open the full report",
first_k:"Minimise first",first_d:"Handled alone although a person had to handle them · out of the cases that needed a person",
second_k:"Minimise next",second_d:"Sent to a person although the agent should have handled them · out of the cases the agent should handle",
score_k:"Combined score",lower:"lower is better",score_d:"(1st × w + 2nd + other failures) / cases evaluated",other:"Other failures (mix-ups, traps, judge): same weight as the 2nd error",other_c:"Other failures",agent_alone_line:"Agent alone, before the safety net",
net_moved:"moved towards a person by the safety net",quality:"Handling quality (ending + traps + judge)",traps:"Forbidden tools called",
per_case:"Per case",calls:"model calls",tokens:"Agent tokens per case",cases_h:"Finished cases (newest first)",waiting:"The first case is on its way…",
res:"Result",case:"Case",exp:"Expected",agent:"Agent",final:"Final",concl:"Agent's conclusion",time:"Time",
t_alone:"Handled alone wrongly",t_person:"Sent to a person wrongly",t_pass:"Passed",t_fail:"Failed",t_ne:"Not evaluated",t_net:"safety net",
rules_h:"Learned rules",rules_none:"No rules learned yet. Run split A, then “Learn rules”.",rules_from:"from run",rules_cases:"cases",
cmp_h:"Runs compared",run_c:"Run",mode_c:"Mode",split_c:"Split",rules_c:"Rules",cases_c:"Cases",first_c:"Alone wrongly (final)",
first_agent_c:"Alone wrongly (agent)",second_c:"To a person wrongly",score_c:"Score",min_c:"Min",
daily_limit:"Daily quota reached on every model: run stopped. Finished cases stay valid. It resumes when the quota renews.",
idle:"Nothing running. Pick the settings and start.",learning:"Learning rules from the run…",
H:{agent_alone:"Agent alone",person_decides:"A person decides",person_only:"A person only",none:"No ending"}},
fr:{title:"Évaluation de l'agent, en direct",intro:"Choisis les cas, lance, et suis les métriques pendant que les cas tournent. Rien de réel n'est envoyé ni réservé.",
mode:"Modèle de l'agent",mode_fast:"Rapide : Gemini Flash Lite (77 cas en ~5-7 min)",mode_groq:"gpt-oss-120b sur Groq (lent en gratuit)",mode_or:"OpenRouter (modèle dans OPENROUTER_MODEL)",
usage_h:"Consommation du quota aujourd'hui",usage_day:"jour de quota",model_c:"Modèle",used_c:"Requêtes utilisées",limit_c:"Limite par jour",room_c:"Reste (après 5 % de marge)",
budget:"Pas assez de quota aujourd'hui pour ce passage",of_cap:"sous le plafond d'évaluation",or_h:"Crédit OpenRouter",or_spent:"dépensés aujourd'hui par les évaluations",or_cap:"plafond d'évaluation",or_key:"clé : utilisé",or_left:"reste sur la clé",need:"demande environ",have:"reste",agent_w:"agent",helper_w:"aides",estimate:"Consommation estimée de ce passage",
source:"Jeu de cas",src_syn:"Synthétiques (3 850, 77 types)",src_hand:"Écrits à la main (31)",src_gen:"Générés par Groq",
per_type:"Cas par type",count:"…ou nombre de cas (si cas par type = 0)",split:"Lot (cas différents de chaque type)",workers:"En parallèle",
weight:"Poids de l'erreur principale",context:"Contexte de l'agent",ctx_lean:"Allégé (économe)",ctx_full:"Complet (guide de tri + guide Bahn)",
use_rules:"Appliquer les règles apprises (refusé sur les cas dont elles viennent)",judge:"Juge (doit / ne doit pas) : 1 appel de plus par cas, inutile pour les 2 erreurs de tri",
run:"Lancer",experiment:"Lancer l'expérience complète (A → apprentissage → lot choisi avec règles → sans)",learn:"Apprendre des règles du dernier passage",stop:"Arrêter",
done:"cas terminés",evaluated:"évalués",not_eval:"non évalués (erreur d'appel, hors des taux)",elapsed:"écoulé",left:"reste environ",
left2:"",running:"en cours",stopping:"arrêt en cours…",finished:"terminé",step:"Étape de l'expérience",open_report:"Ouvrir le rapport complet",
first_k:"À minimiser en priorité",first_d:"Traités seuls alors qu'une personne aurait dû s'en charger · sur les cas qui devaient aller à une personne",
second_k:"À minimiser ensuite",second_d:"Envoyés à une personne alors que l'agent aurait dû les régler seul · sur les cas que l'agent devait régler",
score_k:"Score combiné",lower:"plus bas = mieux",score_d:"(1ʳᵉ × poids + 2ᵉ + autres échecs) / cas évalués",other:"Autres échecs (confusions, pièges, juge) : même poids que la 2ᵉ erreur",other_c:"Autres échecs",agent_alone_line:"Agent seul, avant le filet de sécurité",
net_moved:"remontés vers une personne par le filet",quality:"Qualité du traitement (fin + pièges + juge)",traps:"Outils interdits appelés",
per_case:"Par cas",calls:"appels au modèle",tokens:"Tokens de l'agent par cas",cases_h:"Cas terminés (le plus récent en haut)",waiting:"Le premier cas arrive…",
res:"Résultat",case:"Cas",exp:"Attendu",agent:"Agent",final:"Final",concl:"Conclusion de l'agent",time:"Temps",
t_alone:"Traité seul à tort",t_person:"Envoyé à une personne à tort",t_pass:"Réussi",t_fail:"Échoué",t_ne:"Non évalué",t_net:"filet",
rules_h:"Règles apprises",rules_none:"Pas encore de règles. Lance le lot A, puis « Apprendre des règles ».",rules_from:"du passage",rules_cases:"cas",
cmp_h:"Passages comparés",run_c:"Passage",mode_c:"Mode",split_c:"Lot",rules_c:"Règles",cases_c:"Cas",first_c:"Seul à tort (final)",
first_agent_c:"Seul à tort (agent)",second_c:"Personne à tort",score_c:"Score",min_c:"Min",
daily_limit:"Quota journalier atteint sur tous les modèles : passage arrêté. Les cas déjà faits restent valables. Reprise quand le quota se renouvelle.",
idle:"Rien en cours. Choisis les réglages et lance.",learning:"Apprentissage des règles à partir du passage…",
H:{agent_alone:"Agent seul",person_decides:"Une personne décide",person_only:"Personne uniquement",none:"Aucune fin"}}};
let lang=(()=>{try{return localStorage.getItem('lang')||'en'}catch{return 'en'}})();
const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const t=k=>T[lang][k]??k, pct=v=>v==null?'—':Math.round(v*100)+' %', dur=s=>s==null?'—':(s>=60?Math.floor(s/60)+' min '+String(s%60).padStart(2,'0')+' s':s+' s');
const frac=m=>m?`${m.count}/${m.out_of} (${pct(m.rate)})`:'—';
function applyLang(){document.documentElement.lang=lang;document.querySelectorAll('[data-t]').forEach(e=>e.textContent=t(e.dataset.t));
 document.querySelectorAll('[data-l]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.l===lang));try{localStorage.setItem('lang',lang)}catch{}; if(last)render(last)}
document.querySelectorAll('[data-l]').forEach(b=>b.onclick=()=>{lang=b.dataset.l;applyLang()});
function body(){const d=new FormData($('#f'));return JSON.stringify({mode:d.get('mode'),source:d.get('source'),per_type:+d.get('per_type'),count:+d.get('count'),
 split:d.get('split'),workers:+d.get('workers'),weight:+d.get('weight'),context:d.get('context'),rules:d.get('rules')==='on',judge:d.get('judge')==='on',lang})}
async function post(path){const r=await fetch(path,{method:'POST',body:body()});if(r.ok){$('#err').textContent='';return tick()}
 const e=await r.json();const x=e.estimate||{};$('#err').textContent=e.error!=='budget'?e.error:(x.usd!=null?`${t('budget')}: ~$${x.usd} (${t('have')} $${x.usd_left} ${t('of_cap')})`:`${t('budget')}: ${t('agent_w')} ${t('need')} ${x.agent_requests} (${t('have')} ${x.agent_room}), ${t('helper_w')} ${t('need')} ${x.helper_requests} (${t('have')} ${x.helper_room}).`);tick()}
$('#f').onsubmit=e=>{e.preventDefault();post('/api/start')};$('#exp').onclick=()=>post('/api/experiment');$('#learn').onclick=()=>post('/api/learn');
$('#stop').onclick=()=>fetch('/api/stop',{method:'POST',body:'{}'}).then(tick);
function tag(c){if(c.error)return `<span class="pill warn">${t('t_ne')}</span>`;
 if(c.got==='agent_alone'&&c.expected!=='agent_alone')return `<span class="pill bad">${t('t_alone')}</span>`;
 if(c.expected==='agent_alone'&&c.got!=='agent_alone')return `<span class="pill warn">${t('t_person')}</span>`;
 return c.passed?`<span class="pill ok">${t('t_pass')}</span>`:`<span class="pill bad">${t('t_fail')}</span>`}
let last=null;
function render(s){last=s;const H=T[lang].H;
 ['#go','#exp','#learn'].forEach(b=>$(b).disabled=s.running);$('#stop').disabled=!s.running||s.stopping;
 if(s.error)$('#err').textContent=s.error==='daily_limit'?t('daily_limit'):s.error;
 let html='';
 if(!s.running&&!s.summary)html+=`<h2></h2><div class=empty>${t('idle')}</div>`;
 const m=s.summary,w=s.total?Math.round(100*s.done/s.total):0;
 if(s.running||m){html+=`<div class=progress><div class=row>${s.experiment?`<span>${t('step')} <b>${s.experiment.step}/${s.experiment.of}</b> · <b>${esc(s.experiment.label)}</b></span>`:''}
 <span><b>${s.done} / ${s.total||'…'}</b> ${t('done')}${m?` · <b>${m.cases}</b> ${t('evaluated')}${m.not_evaluated.length?` · <b>${m.not_evaluated.length}</b> ${t('not_eval')}`:''}`:''}</span>
 <span>${t('elapsed')} <b>${dur(s.elapsed)}</b></span><span>${t('left')} <b>${s.running&&s.eta!=null?dur(s.eta):'—'}</b> ${t('left2')}</span>
 <span>${s.phase==='learn'?t('learning'):s.running?(s.stopping?t('stopping'):t('running')):t('finished')}</span></div>
 <div class=bar><i style="width:${w}%"></i></div>${s.report?`<a href="/report" target=_blank>${t('open_report')}</a>`:''}</div>`}
 if(m){const a=m.auto_when_human,h=m.human_when_auto,r=m.agent_only||{};html+=`<div class=triage>
 <div class="metric main"><span class=k>${t('first_k')}</span><b>${a.count} <small>/ ${a.out_of}</small></b><em>${pct(a.rate)}</em><span class=d>${t('first_d')}</span></div>
 <div class="metric second"><span class=k>${t('second_k')}</span><b>${h.count} <small>/ ${h.out_of}</small></b><em>${pct(h.rate)}</em><span class=d>${t('second_d')}</span></div>
 <div class=metric><span class=k>${t('score_k')}</span><b>${m.weighted_error??'—'}</b><em>${t('lower')}</em><span class=d>${t('score_d')}</span></div></div>
 <div class="row" style="margin-top:8px"><span>${t('agent_alone_line')}: <b>${frac(r.auto_when_human)}</b> · <b>${frac(r.human_when_auto)}</b> · ${t('score_k')} <b>${r.weighted_error??'—'}</b></span>
 <span><b>${m.safety_net_changes||0}</b> ${t('net_moved')}</span></div>
 <div class=tiles><div class=tile><b>${frac(m.other_failures)}</b><span>${t('other')}</span></div><div class=tile><b>${pct(m.pass_rate_cases)}</b><span>${t('quality')}</span></div>
 <div class=tile><b>${Object.values(m.trap_violations).reduce((x,y)=>x+y,0)}</b><span>${t('traps')}</span></div>
 <div class=tile><b>${m.avg_seconds} s</b><span>${t('per_case')} · ${m.avg_llm_calls} ${t('calls')}</span></div>
 <div class=tile><b>${(m.avg_agent_tokens||0).toLocaleString(lang)}</b><span>${t('tokens')}</span></div></div>`}
 if(s.estimate)html+=`<div class=row style="margin-top:8px"><span>${t('estimate')}: ${t('agent_w')} <b>${s.estimate.agent_requests}</b>${s.estimate.agent_room!=null?' / '+s.estimate.agent_room:''}${s.estimate.usd!=null?` (~$${s.estimate.usd})`:''} · ${t('helper_w')} <b>${s.estimate.helper_requests}</b> / ${s.estimate.helper_room??'—'}</span></div>`;
 const o=s.usage.openrouter;if(o){const a=o.account||{};html+=`<h2>${t('or_h')} <span class=small>(${esc(o.model)})</span></h2><div class=row><span><b>$${o.spent_today_usd}</b> ${t('or_spent')} · ${t('or_cap')} <b>$${o.budget_usd}</b></span>${a.usage_usd!=null?`<span>${t('or_key')} <b>$${(+a.usage_usd).toFixed(4)}</b>${a.limit_remaining_usd!=null?` · ${t('or_left')} <b>$${(+a.limit_remaining_usd).toFixed(2)}</b>`:''}</span>`:''}${a.error?`<span class=mute>${esc(a.error)}</span>`:''}</div>`}
 html+=`<h2>${t('usage_h')} <span class=small>(${t('usage_day')} ${esc(s.usage.day)})</span></h2><table><tr><th>${t('model_c')}</th><th>${t('used_c')}</th><th>${t('limit_c')}</th><th>${t('room_c')}</th></tr>${s.usage.models.filter(u=>u.requests||u.room!==null).map(u=>`<tr>
 <td>${esc(u.model)}</td><td>${u.requests}</td><td>${u.limit_requests??'—'}${u.limit_tokens?` · ${u.limit_tokens.toLocaleString(lang)} tokens`:''}</td><td class="${u.room===0?'mute':''}"><b>${u.room??'—'}</b></td></tr>`).join('')}</table>`;
 html+=`<h2>${t('rules_h')}</h2>`+(s.rules?`<div class=rules><div class=small>${s.rules.rules.length} · ${t('rules_from')} ${esc(s.rules.from_run)} · ${s.rules.cases} ${t('rules_cases')}</div><ol>${s.rules.rules.map(x=>`<li>${esc(x)}</li>`).join('')}</ol></div>`:`<div class=empty>${t('rules_none')}</div>`);
 if(s.comparison.length)html+=`<h2>${t('cmp_h')}</h2><table><tr><th>${t('run_c')}</th><th>${t('mode_c')}</th><th>${t('split_c')}</th><th>${t('rules_c')}</th><th>${t('cases_c')}</th>
 <th>${t('first_c')}</th><th>${t('first_agent_c')}</th><th>${t('second_c')}</th><th>${t('other_c')}</th><th>${t('score_c')}</th><th>${t('min_c')}</th></tr>${s.comparison.map(c=>`<tr>
 <td><a href="/report/${esc(c.run)}" target=_blank>${esc(c.run)}</a></td><td>${esc(c.mode)}</td><td>${esc(c.split||'—')}</td><td>${c.rules||'—'}</td><td>${c.cases}</td>
 <td>${frac(c.first)}</td><td class=mute>${frac(c.first_agent)}</td><td>${frac(c.second)}</td><td>${frac(c.other)}</td><td><b>${c.score??'—'}</b></td><td>${c.minutes??'—'}</td></tr>`).join('')}</table>`;
 html+=`<h2>${t('cases_h')}</h2>`+(s.cases.length?`<table><tr><th>${t('res')}</th><th>${t('case')}</th><th>${t('exp')}</th><th>${t('agent')}</th><th>${t('final')}</th><th>${t('concl')}</th><th>${t('time')}</th></tr>${s.cases.map(c=>`<tr><td>${tag(c)}</td>
 <td><b>${esc(c.type)}</b><div class=small>${esc(c.id)} · ${esc(c.summary)}</div></td><td>${H[c.expected]}</td><td>${H[c.got_raw]||esc(c.got_raw)}</td>
 <td>${H[c.got]||esc(c.got)}${c.net.length?`<div class=small title="${esc(c.net.join('; '))}">${t('t_net')}</div>`:''}${c.traps.length?'<div class="pill bad">trap</div>':''}</td>
 <td class=small>${esc(c.conclusion)||'—'}<details data-trace="${esc(c.id)}"><summary>${lang==='fr'?'Voir les appels d’outils':'Inspect tool calls'}</summary><pre>${esc(JSON.stringify(c.steps,null,2))}</pre></details></td><td class=mute>${c.seconds} s</td></tr>`).join('')}</table>`:(s.running?`<div class=empty>${t('waiting')}</div>`:''));
 const opened=[...document.querySelectorAll('details[data-trace][open]')].map(e=>e.dataset.trace);$('#live').innerHTML=html;document.querySelectorAll('details[data-trace]').forEach(e=>e.open=opened.includes(e.dataset.trace))}
let timer;async function tick(){clearTimeout(timer);try{const s=await (await fetch('/api/status')).json();render(s);timer=setTimeout(tick,s.running?1500:5000)}catch{timer=setTimeout(tick,4000)}}
applyLang();tick();
</script></main></body></html>"""


def main(argv):
    port = int(argv[argv.index("--port") + 1]) if "--port" in argv else 8765
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Live evaluation: http://127.0.0.1:{port}  (Ctrl+C to stop)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main(sys.argv[1:])
