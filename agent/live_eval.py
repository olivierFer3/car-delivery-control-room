"""Live evaluation page: choose how many cases, start, watch the metrics update case by case.

    python3 agent/live_eval.py            # then open http://127.0.0.1:8765
    python3 agent/live_eval.py --port 9000

Standard library only. Runs on this computer only (127.0.0.1). Uses the Groq key of agent/mvp.py.
When a run ends (or is stopped), the full report is written to agent/eval_results/live-<time>/.
"""

import json
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import case_agent  # noqa: E402
import evaluate  # noqa: E402
import mvp  # noqa: E402
import report  # noqa: E402

STATE = {"running": False}
LOCK = threading.Lock()
STOP = threading.Event()


def status():
    with LOCK:
        if not STATE.get("results") and not STATE.get("running"):
            return {"running": False, "idle": True, **{k: STATE.get(k) for k in ("report", "error")}}
        results = list(STATE.get("results", []))
        done, total = len(results), STATE.get("total", 0)
        elapsed = time.time() - STATE["started"] if STATE.get("started") else 0
        if STATE.get("finished"):
            elapsed = STATE["finished"] - STATE["started"]
        summary = evaluate.summarise(results) if results else None
        per_case = elapsed / done if done else None
        return {
            "running": STATE["running"], "stopping": STOP.is_set(), "done": done, "total": total,
            "elapsed": round(elapsed), "eta": round(per_case * (total - done)) if per_case and STATE["running"] else None,
            "settings": STATE.get("settings"), "models": STATE.get("models"), "summary": summary,
            "report": STATE.get("report"), "error": STATE.get("error"),
            "cases": [{
                "id": r["case"]["id"], "type": r["case"]["problem_type"], "summary": r["case"]["summary"],
                "expected": r["score"]["expected"], "got": r["score"]["got"], "ending": r["score"]["ending"],
                "passed": r["score"]["passed"], "seconds": r["trace"]["timing"]["seconds"],
                "error": bool(r["trace"]["error"]), "traps": r["score"]["trap_violations"],
                "conclusion": ((r["trace"]["finish"] or {}).get("recommendation") or (r["trace"]["finish"] or {}).get("summary") or "")[:240],
            } for r in reversed(results)],
        }


def run(settings):
    try:
        records = evaluate.sample(evaluate.load(settings["source"]), settings["per_type"], settings["count"])
        mvp.pick_model()
        case_agent.HELPER_MODEL = mvp.other_model() if settings["helpers"] == "gemini" else mvp.groq_other_model()
        case_agent.CONTEXT_LEVEL = settings["context"]
        evaluate.JUDGE_MODEL = evaluate.judge_model()
        evaluate.WEIGHT = settings["weight"]
        with LOCK:
            STATE.update(total=len(records), models={"agent": mvp.MODEL, "helper": case_agent.HELPER_MODEL, "judge": evaluate.JUDGE_MODEL, "pool": mvp.POOL})
        with ThreadPoolExecutor(max_workers=settings["workers"]) as pool:
            futures = [pool.submit(evaluate.run_one, record, settings["judge"]) for record in records]
            for future in as_completed(futures):
                if future.cancelled():
                    continue
                result = future.result()
                daily = "daily limit" in (result["trace"]["error"] or "")
                with LOCK:
                    if not daily:  # a case refused for quota says nothing; keep it out of the page and report
                        STATE["results"].append(result)
                    else:
                        STATE["error"] = ("Quota journalier Groq atteint pour tous les modèles : évaluation arrêtée. "
                                          "Les cas déjà faits restent valables. Reprise quand le quota se renouvelle, "
                                          "ou avec le plan Developer de Groq.")
                if daily:
                    STOP.set()
                if STOP.is_set():
                    for pending in futures:
                        pending.cancel()
        write_report(settings)
    except BaseException as error:  # noqa: BLE001 - shown on the page, the server keeps running
        with LOCK:
            STATE["error"] = str(error)
    finally:
        with LOCK:
            STATE["running"], STATE["finished"] = False, time.time()


def write_report(settings):
    with LOCK:
        results = list(STATE["results"])
    if not results:
        return
    summary = evaluate.summarise(results)
    summary.update(source=settings["source"], judge=settings["judge"], finished_at=datetime.now().isoformat(timespec="seconds"))
    out = evaluate.RESULTS / f"live-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
    out.mkdir(parents=True, exist_ok=True)
    with (out / "results.jsonl").open("w", encoding="utf-8") as handle:
        for result in results:
            handle.write(json.dumps(result, ensure_ascii=False) + "\n")
    (out / "summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False))
    (out / "report.html").write_text(report.render(summary, results), encoding="utf-8")
    with LOCK:
        STATE["report"] = str(out.relative_to(HERE.parent) / "report.html")


def start(body):
    try:
        settings = {
            "source": body.get("source", "hand") if body.get("source") in evaluate.FILES else "hand",
            "count": max(1, min(int(body.get("count", 10)), 5000)),
            "per_type": max(0, min(int(body.get("per_type", 0)), 50)),
            "workers": max(1, min(int(body.get("workers", 2)), 8)),
            "judge": bool(body.get("judge", False)),
            "weight": max(1.0, min(float(body.get("weight", 3)), 20.0)),
            "context": "full" if body.get("context") == "full" else "lean",
            "helpers": "groq" if body.get("helpers") == "groq" else "gemini",
        }
    except (TypeError, ValueError):
        return 400, {"error": "Invalid settings"}
    if settings["per_type"]:
        settings["count"] = 0  # per type decides the size
    with LOCK:
        if STATE.get("running"):
            return 409, {"error": "A run is already in progress"}
        STOP.clear()
        STATE.clear()
        STATE.update(running=True, started=time.time(), results=[], settings=settings, total=0)
    threading.Thread(target=run, args=(settings,), daemon=True).start()
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
            return self.send(200, PAGE, "text/html")
        if self.path == "/api/status":
            return self.send(200, status())
        if self.path.startswith("/report"):
            with LOCK:
                path = STATE.get("report")
            if path and (HERE.parent / path).exists():
                return self.send(200, (HERE.parent / path).read_text(encoding="utf-8"), "text/html")
        self.send(404, {"error": "Not found"})

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            return self.send(400, {"error": "Invalid JSON"})
        if self.path == "/api/start":
            return self.send(*start(body))
        if self.path == "/api/stop":
            STOP.set()
            return self.send(202, {"ok": True})
        self.send(404, {"error": "Not found"})


PAGE = r"""<!doctype html><html lang=fr><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>Évaluation en direct</title><style>
:root{--bg:#fbfaf6;--card:#fff;--ink:#16140f;--muted:#6d6656;--hair:#e7e2d7;--ok:#1b7a52;--ok-bg:#e8f5ee;--bad:#b42c42;--bad-bg:#fdeef0;
--warn:#a5520f;--warn-bg:#fdf1e7;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#15140f;--card:#1e1c16;--ink:#f1eee6;--muted:#a49d8c;--hair:#34312a;--ok:#5fc795;--ok-bg:#16301f;
--bad:#f07a8c;--bad-bg:#3a1a20;--warn:#f0a35e;--warn-bg:#382513;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:1080px;margin:0 auto;padding:28px 16px 64px}h1{font-size:26px;margin:0}h2{font-size:17px;margin:28px 0 10px}.sub{color:var(--muted)}
form{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;align-items:end;background:var(--card);border:1px solid var(--hair);border-radius:14px;padding:16px;margin-top:18px}
label{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--muted)}input,select{font:inherit;color:var(--ink);background:var(--bg);border:1px solid var(--hair);border-radius:8px;padding:7px 9px}
.check{flex-direction:row;align-items:center;gap:8px}.buttons{display:flex;gap:8px}button{font:inherit;border-radius:8px;padding:8px 14px;border:1px solid var(--ink);cursor:pointer}
.go{background:var(--ink);color:var(--bg)}.stop{background:transparent;color:var(--ink)}button:disabled{opacity:.4;cursor:default}
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
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--hair);vertical-align:top;font-size:14px}th{font-size:12px;color:var(--muted)}
.pill{display:inline-block;padding:1px 8px;border-radius:99px;font-size:12px;font-weight:700;white-space:nowrap}.ok{background:var(--ok-bg);color:var(--ok)}
.bad{background:var(--bad-bg);color:var(--bad)}.warn{background:var(--warn-bg);color:var(--warn)}.mute{color:var(--muted)}.small{font-size:12px;color:var(--muted)}
.empty{color:var(--muted);padding:28px;text-align:center;background:var(--card);border:1px dashed var(--hair);border-radius:12px}.err{color:var(--bad);font-weight:600;margin-top:10px}
a{color:inherit}
</style></head><body><main>
<h1>Évaluation de l'agent, en direct</h1>
<div class=sub>Choisis le nombre de cas, lance, et suis les métriques pendant que les cas tournent. Rien de réel n'est envoyé ni réservé.</div>
<form id=f>
<label>Jeu de cas<select name=source><option value=hand>Écrits à la main (31)</option><option value=synthetic>Synthétiques (3850, 77 types)</option><option value=generated>Générés par Groq</option></select></label>
<label>Nombre de cas<input name=count type=number min=1 max=5000 value=30></label>
<label>…ou cas par type<input name=per_type type=number min=0 max=50 value=0 title="0 = utiliser le nombre de cas"></label>
<label>En parallèle<input name=workers type=number min=1 max=8 value=2></label>
<label>Poids de l'erreur principale<input name=weight type=number min=1 max=20 step=0.5 value=3></label>
<label>Contexte de l'agent<select name=context><option value=lean>Allégé (économe)</option><option value=full>Complet (guide de tri + guide Bahn, ~2 000 tokens de plus par appel)</option></select></label>
<label>Aides (chauffeur, site, recherche, juge)<select name=helpers><option value=gemini>Gemini (Flash Lite puis Gemma) : garde le quota Groq pour l'agent, 1 à 8 s par réponse</option><option value=groq>Groq : rapide (moins d'1 s), mais partage le quota de l'agent</option></select></label>
<label class=check><input name=judge type=checkbox> Juge (doit / ne doit pas) : 1 appel de plus par cas, inutile pour les 2 erreurs de tri</label>
<div class=buttons><button class=go id=go type=submit>Lancer</button><button class=stop id=stop type=button disabled>Arrêter</button></div>
</form>
<div id=err class=err></div>
<div id=live></div>
<script>
const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const H={agent_alone:'Agent seul',person_decides:'Une personne décide',person_only:'Personne uniquement',none:'Aucune fin'};
const pct=v=>v==null?'—':Math.round(v*100)+' %', dur=s=>s==null?'—':(s>=60?Math.floor(s/60)+' min '+String(s%60).padStart(2,'0')+' s':s+' s');
$('#f').onsubmit=async e=>{e.preventDefault();const d=new FormData(e.target);
 const body={source:d.get('source'),count:+d.get('count'),per_type:+d.get('per_type'),workers:+d.get('workers'),weight:+d.get('weight'),context:d.get('context'),helpers:d.get('helpers'),judge:d.get('judge')==='on'};
 const r=await fetch('/api/start',{method:'POST',body:JSON.stringify(body)});$('#err').textContent=r.ok?'':(await r.json()).error;tick()};
$('#stop').onclick=()=>fetch('/api/stop',{method:'POST',body:'{}'}).then(tick);
function tag(c){if(c.error)return '<span class="pill warn">Non évalué</span>';
 if(c.got==='agent_alone'&&c.expected!=='agent_alone')return '<span class="pill bad">Traité seul à tort</span>';
 if(c.expected==='agent_alone'&&c.got!=='agent_alone')return '<span class="pill warn">Envoyé à une personne à tort</span>';
 return c.passed?'<span class="pill ok">Réussi</span>':'<span class="pill bad">Échoué</span>'}
function render(s){
 $('#go').disabled=s.running;$('#stop').disabled=!s.running||s.stopping;
 if(s.error)$('#err').textContent='Erreur : '+s.error;
 if(s.idle){$('#live').innerHTML='<h2>Résultats</h2><div class=empty>Aucune évaluation en cours. Choisis les réglages et lance.</div>';return}
 const m=s.summary, a=m&&m.auto_when_human, h=m&&m.human_when_auto, w=s.total?Math.round(100*s.done/s.total):0;
 let html=`<div class=progress><div class=row><span><b>${s.done} / ${s.total||'…'}</b> cas terminés${m?` : <b>${m.cases}</b> évalués${m.not_evaluated.length?`, <b>${m.not_evaluated.length}</b> non évalués (erreur d'appel, hors des taux)`:''}`:''}</span><span>écoulé <b>${dur(s.elapsed)}</b></span>
 <span>reste environ <b>${s.running?dur(s.eta):'—'}</b></span><span>${s.running?(s.stopping?'arrêt en cours…':'en cours'):'terminé'}</span>
 ${s.models?`<span>agent <b>${esc(s.models.agent)}</b> · aides <b>${esc(s.models.helper)}</b></span>`:''}</div>
 <div class=bar><i style="width:${w}%"></i></div>${s.report?`<a href="/report" target=_blank>Ouvrir le rapport complet</a> <span class=small>(${esc(s.report)})</span>`:''}</div>`;
 if(m){html+=`<div class=triage>
 <div class="metric main"><span class=k>À minimiser en priorité</span><b>${a.count} <small>/ ${a.out_of}</small></b><em>${pct(a.rate)}</em><span class=d>Traités seuls alors qu'une personne aurait dû s'en charger · sur les cas évalués qui devaient aller à une personne</span></div>
 <div class="metric second"><span class=k>À minimiser ensuite</span><b>${h.count} <small>/ ${h.out_of}</small></b><em>${pct(h.rate)}</em><span class=d>Envoyés à une personne alors que l'agent aurait dû les régler seul · sur les cas évalués que l'agent devait régler seul</span></div>
 <div class="metric"><span class=k>Score combiné</span><b>${m.weighted_error??'—'}</b><em>plus bas = mieux</em><span class=d>(1ʳᵉ × ${m.weight} + 2ᵉ) / cas évalués</span></div></div>
 <div class=tiles><div class=tile><b>${pct(m.pass_rate_cases)}</b><span>Qualité du traitement (fin + pièges + juge)</span></div>
 <div class=tile><b>${pct(m.ending_accuracy)}</b><span>Bonne fin exacte</span></div>
 <div class=tile><b>${Object.values(m.trap_violations).reduce((x,y)=>x+y,0)}</b><span>Outils interdits appelés</span></div>
 <div class=tile><b>${m.person_kind_mixups}</b><span>Confusions « décide » / « uniquement »</span></div>
 <div class=tile><b>${m.not_evaluated.length}</b><span>Non évalués (quota, erreur)</span></div>
 <div class=tile><b>${m.avg_seconds} s</b><span>Par cas · ${m.avg_llm_calls} appels au modèle</span></div>
 <div class=tile><b>${(m.avg_agent_tokens||0).toLocaleString('fr')}</b><span>Tokens de l'agent par cas (entrée + sortie)</span></div></div>`}
 html+='<h2>Cas terminés (le plus récent en haut)</h2>';
 html+=s.cases.length?`<table><tr><th>Résultat</th><th>Cas</th><th>Attendu</th><th>Agent</th><th>Conclusion de l'agent</th><th>Temps</th></tr>${s.cases.map(c=>`<tr><td>${tag(c)}</td>
 <td><b>${esc(c.type)}</b><div class=small>${esc(c.id)} · ${esc(c.summary)}</div></td><td>${H[c.expected]}</td><td>${H[c.got]||esc(c.got)}${c.traps.length?'<div class="pill bad">piège</div>':''}</td>
 <td class=small>${esc(c.conclusion)||'—'}</td><td class=mute>${c.seconds} s</td></tr>`).join('')}</table>`:'<div class=empty>Le premier cas arrive… (chaque cas prend 10 à 60 s)</div>';
 $('#live').innerHTML=html}
let timer;async function tick(){clearTimeout(timer);try{const s=await (await fetch('/api/status')).json();render(s);timer=setTimeout(tick,s.running?1500:5000)}catch{timer=setTimeout(tick,4000)}}
tick();
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
