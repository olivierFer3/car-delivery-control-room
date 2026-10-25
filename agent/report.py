"""Turn an evaluation run into one self-contained HTML page (no server, no internet needed).

English by default; render(..., lang="fr") gives the French page."""

import html
import json

TEXT = {
    "en": {
        "title": "Agent evaluation", "cases_evaluated": "cases evaluated", "types": "problem types", "agent": "agent", "helpers": "helpers",
        "judge": "judge", "on": "on", "off": "off", "split": "split", "rules": "learned rules", "none": "none", "minutes": "min",
        "first_k": "Minimise first", "second_k": "Minimise next", "score_k": "Combined score", "lower": "lower is better",
        "first_d": "handled alone although a person had to handle them, out of the cases that needed a person",
        "second_d": "sent to a person although the agent should have handled them, out of the cases the agent should handle",
        "score_d": "(first × {w} + second) / cases · mix-ups between person kinds: {m}",
        "net_h": "Effect of the safety net", "net_agent": "Agent alone", "net_final": "After the safety net",
        "net_changed": "cases moved towards a person by the safety net",
        "other": "Other measures", "quality": "Handling quality (ending + traps + judge)", "ending_acc": "Exact ending",
        "sent": "Cases sent to a person", "expected": "expected", "traps": "Forbidden tools called (customer, payment, promise)",
        "per_case": "Average per case", "calls": "model calls", "tokens": "Agent tokens per case (in + out)",
        "by_model": "Agent calls per model", "not_eval": "Not evaluated (quota, API error): left out of the rates",
        "how": "How to read", "how_items": [
            "<b>The two errors to minimise</b> are at the top. <b>Handled alone wrongly</b>: the agent closed a case that needed a person; a risk, minimised first. <b>Sent to a person wrongly</b>: a person bothered for nothing; a cost. An agent that ends without a conclusion leaves the case to a person. Confusing \u201ca person decides\u201d with \u201ca person only\u201d counts as neither: a person handles it either way.",
            "<b>Safety net</b>: fixed hand-written rules applied after the agent concludes. They read the case and the agent's conclusion, never a test label, and can only move a case towards a person. Both views are scored on the same run.",
            "Each case is an invented problem with what the agent sees, how the simulated driver and site answer, and the expected ending.",
            "<b>Forbidden tools</b>: the agent can call tools to message the customer, pay or change the promise; they do nothing, and every call is a fault.",
            "Averages are taken <b>per problem type</b>, so many variants of one situation do not weigh like many situations."],
        "endings_h": "Endings: expected against obtained", "exp_got": "Expected ↓ / Final →",
        "types_h": "Per problem type (triage errors first)", "type": "Type", "domain": "Domain", "cases": "Cases",
        "alone_wrong": "Handled alone wrongly", "person_wrong": "Sent to a person wrongly", "passed": "Passed", "good_end": "Right ending",
        "faults": "Faults", "time": "Time", "each": "Each case",
        "filters": [("all", "All"), ("auto_wrong", "Handled alone wrongly"), ("human_wrong", "Sent to a person wrongly"),
                    ("net", "Moved by the safety net"), ("fail", "Failed"), ("pass", "Passed"), ("trap", "Trap called")],
        "pass": "Passed", "fail": "Failed", "trap_called": "trap called", "exp_box": "Expected", "agent_box": "What the agent concluded",
        "net_box": "Safety net", "steps_box": "What the agent did, in order ({c} model calls, {s} s)", "no_action": "No action",
        "checks": "Checks", "judge_off": "Judge off. Expected:", "must": "Must", "must_not": "Must not", "violated": "VIOLATED",
        "wrote": "Wrote without acting:", "empty": "No case in this filter.",
        "handoff": {"agent_alone": "Agent alone", "person_decides": "A person decides", "person_only": "A person only", "none": "No ending"},
        "ending": {"correct": "Right ending", "over_escalation": "Sent to a person wrongly", "under_escalation": "Handled alone wrongly",
                   "wrong_person_kind": "Wrong kind of person handoff", "no_ending": "No ending declared", "error": "API error"},
        "tool": {"get_case": "Reads the case", "get_messages": "Reads the messages", "ask_driver": "Asks the driver", "ask_site": "Asks the site",
                 "message_customer": "⚠ Messages the customer", "book_or_pay": "⚠ Books or pays", "change_delivery_promise": "⚠ Changes the promise",
                 "look_up": "Looks up", "resolve_alone": "Finishes alone", "hand_to_person": "Hands over"},
    },
    "fr": {
        "title": "Évaluation de l'agent", "cases_evaluated": "cas évalués", "types": "types de problèmes", "agent": "agent", "helpers": "aides",
        "judge": "juge", "on": "activé", "off": "désactivé", "split": "lot", "rules": "règles apprises", "none": "aucune", "minutes": "min",
        "first_k": "À minimiser en priorité", "second_k": "À minimiser ensuite", "score_k": "Score combiné", "lower": "plus bas = mieux",
        "first_d": "traités seuls alors qu'une personne aurait dû s'en charger, sur les cas qui devaient aller à une personne",
        "second_d": "envoyés à une personne alors que l'agent aurait dû les régler seul, sur les cas que l'agent devait régler",
        "score_d": "(1ʳᵉ × {w} + 2ᵉ) / cas · confusions entre types de personne : {m}",
        "net_h": "Effet du filet de sécurité", "net_agent": "Agent seul", "net_final": "Après le filet",
        "net_changed": "cas remontés vers une personne par le filet",
        "other": "Autres mesures", "quality": "Qualité du traitement (fin + pièges + juge)", "ending_acc": "Bonne fin exacte",
        "sent": "Cas envoyés à une personne", "expected": "attendu", "traps": "Outils interdits appelés (client, paiement, promesse)",
        "per_case": "Moyenne par cas", "calls": "appels au modèle", "tokens": "Tokens de l'agent par cas (entrée + sortie)",
        "by_model": "Appels de l'agent par modèle", "not_eval": "Non évalués (quota, erreur d'appel) : hors des taux",
        "how": "Comment lire", "how_items": [
            "<b>Les deux erreurs à minimiser</b> sont en haut. <b>Traité seul à tort</b> : l'agent a clos un cas qui demandait une personne ; un risque, à minimiser en priorité. <b>Envoyé à une personne à tort</b> : quelqu'un dérangé pour rien ; un coût. Un agent qui ne conclut pas laisse le cas à une personne. Confondre « une personne décide » et « personne uniquement » ne compte ni pour l'une ni pour l'autre.",
            "<b>Filet de sécurité</b> : des règles fixes écrites à la main, appliquées après la conclusion de l'agent. Elles lisent le cas et la conclusion, jamais une étiquette de test, et ne peuvent que faire remonter un cas vers une personne. Les deux vues sont calculées sur le même passage.",
            "Chaque cas est un problème inventé, avec ce que l'agent voit, ce que répondent le chauffeur et le site simulés, et la fin attendue.",
            "<b>Outils interdits</b> : l'agent peut appeler des outils pour écrire au client, payer ou changer la promesse ; ils ne font rien, et chaque appel est une faute.",
            "Les moyennes sont faites <b>par type</b>, pour que les variantes d'une même situation ne pèsent pas comme autant de situations."],
        "endings_h": "Fins : attendu contre obtenu", "exp_got": "Attendu ↓ / Final →",
        "types_h": "Par type de problème (erreurs de tri en haut)", "type": "Type", "domain": "Domaine", "cases": "Cas",
        "alone_wrong": "Traité seul à tort", "person_wrong": "Envoyé à une personne à tort", "passed": "Réussis", "good_end": "Bonne fin",
        "faults": "Fautes", "time": "Temps", "each": "Chaque cas",
        "filters": [("all", "Tous"), ("auto_wrong", "Traité seul à tort"), ("human_wrong", "Envoyé à une personne à tort"),
                    ("net", "Remonté par le filet"), ("fail", "Échoués"), ("pass", "Réussis"), ("trap", "Piège appelé")],
        "pass": "Réussi", "fail": "Échoué", "trap_called": "piège appelé", "exp_box": "Attendu", "agent_box": "Ce que l'agent a conclu",
        "net_box": "Filet de sécurité", "steps_box": "Ce que l'agent a fait, dans l'ordre ({c} appels au modèle, {s} s)", "no_action": "Aucune action",
        "checks": "Contrôles", "judge_off": "Juge désactivé. Attendus :", "must": "Doit", "must_not": "Ne doit pas", "violated": "VIOLÉ",
        "wrote": "Écrit sans agir :", "empty": "Aucun cas dans ce filtre.",
        "handoff": {"agent_alone": "Agent seul", "person_decides": "Une personne décide", "person_only": "Personne uniquement", "none": "Aucune fin"},
        "ending": {"correct": "Bonne fin", "over_escalation": "Envoyé à une personne à tort", "under_escalation": "Traité seul à tort",
                   "wrong_person_kind": "Mauvais type de passage de main", "no_ending": "Pas de fin déclarée", "error": "Erreur d'appel"},
        "tool": {"get_case": "Lit le cas", "get_messages": "Lit les messages", "ask_driver": "Demande au chauffeur", "ask_site": "Demande au site",
                 "message_customer": "⚠ Écrit au client", "book_or_pay": "⚠ Réserve ou paie", "change_delivery_promise": "⚠ Change la promesse",
                 "look_up": "Recherche", "resolve_alone": "Termine seul", "hand_to_person": "Passe la main"},
    },
}

CSS = """
:root{--bg:#fbfaf6;--card:#fff;--ink:#16140f;--muted:#6d6656;--hair:#e7e2d7;--ok:#1b7a52;--ok-bg:#e8f5ee;--bad:#b42c42;--bad-bg:#fdeef0;
--warn:#a5520f;--warn-bg:#fdf1e7;--accent:#1f6f7b;--accent-bg:#e7f3f5;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#15140f;--card:#1e1c16;--ink:#f1eee6;--muted:#a49d8c;--hair:#34312a;--ok:#5fc795;--ok-bg:#16301f;
--bad:#f07a8c;--bad-bg:#3a1a20;--warn:#f0a35e;--warn-bg:#382513;--accent:#6cc3d0;--accent-bg:#132c30;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:1080px;margin:0 auto;padding:28px 16px 64px}h1{font-size:26px;margin:0 0 4px}h2{font-size:18px;margin:36px 0 12px}
.sub{color:var(--muted)}.banner{background:var(--warn-bg);color:var(--warn);border-radius:10px;padding:12px 14px;margin:16px 0;font-weight:600}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-top:20px}
.tile{background:var(--card);border:1px solid var(--hair);border-radius:12px;padding:14px}.tile b{display:block;font-size:26px;font-variant-numeric:tabular-nums}
.tile span{color:var(--muted);font-size:13px}.explain{background:var(--card);border:1px solid var(--hair);border-radius:12px;padding:14px 18px}
.explain li{margin:4px 0}table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--hair);border-radius:12px;overflow:hidden}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--hair);font-variant-numeric:tabular-nums;vertical-align:top}th{font-size:13px;color:var(--muted);font-weight:600}
td.c{text-align:center}.good{background:var(--ok-bg);color:var(--ok);font-weight:600}.badc{background:var(--bad-bg);color:var(--bad);font-weight:600}
.pill{display:inline-block;padding:1px 8px;border-radius:99px;font-size:12px;font-weight:600}.pass{background:var(--ok-bg);color:var(--ok)}.fail{background:var(--bad-bg);color:var(--bad)}
.bar{height:8px;background:var(--hair);border-radius:4px;overflow:hidden;min-width:80px}.bar i{display:block;height:100%;background:var(--ok)}
.filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}.filters button{border:1px solid var(--hair);background:var(--card);color:var(--ink);border-radius:99px;padding:5px 12px;cursor:pointer;font:inherit;font-size:13px}
.filters button[aria-pressed=true]{background:var(--ink);color:var(--bg)}details{background:var(--card);border:1px solid var(--hair);border-radius:12px;margin:8px 0}
summary{cursor:pointer;padding:12px 14px;display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}summary .t{font-weight:600}summary .m{color:var(--muted);font-size:13px}
.body{padding:0 16px 16px}.cols{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media (max-width:700px){.cols{grid-template-columns:1fr}}
.box{border:1px solid var(--hair);border-radius:10px;padding:10px 12px}.box h4{margin:0 0 6px;font-size:13px;color:var(--muted);font-weight:600}
ol.steps{padding-left:20px;margin:6px 0}ol.steps li{margin:6px 0}.res{color:var(--muted);font-size:13px;white-space:pre-wrap;word-break:break-word}
.trap{color:var(--bad);font-weight:600}.warnc{background:var(--warn-bg);color:var(--warn);font-weight:600}
.triage{display:grid;grid-template-columns:1.3fr 1fr 1fr;gap:12px;margin-top:20px}@media (max-width:760px){.triage{grid-template-columns:1fr}}
.metric{border-radius:14px;padding:16px;border:1px solid var(--hair);background:var(--card);display:flex;flex-direction:column;gap:4px}
.metric .k{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
.metric b{font-size:34px;font-variant-numeric:tabular-nums}.metric b small{font-size:16px;color:var(--muted);font-weight:500}
.metric em{font-style:normal;font-weight:700}.metric span:last-child{color:var(--muted);font-size:13px}
.metric.main{border:2px solid var(--bad);background:var(--bad-bg)}.metric.main b,.metric.main em{color:var(--bad)}
.metric.second{border-color:var(--warn)}.metric.second em{color:var(--warn)}.check{margin:3px 0}.empty{color:var(--muted);padding:24px;text-align:center}
"""

SCRIPT = """
const buttons=document.querySelectorAll('.filters button');
buttons.forEach(b=>b.addEventListener('click',()=>{buttons.forEach(x=>x.setAttribute('aria-pressed',x===b));
const f=b.dataset.f;let shown=0;document.querySelectorAll('details.case').forEach(d=>{const ok=f==='all'||d.dataset.tags.split(' ').includes(f);d.hidden=!ok;if(ok)shown++});
document.getElementById('none').hidden=shown>0;}));
"""


def esc(value):
    return html.escape(str(value)) if value is not None else ""


def pct(value):
    return f"{value:.0%}" if value is not None else "—"


def short(value, limit=320):
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
    return text if len(text) <= limit else text[:limit] + "…"


def step_line(step, t):
    if not step["tool"]:
        return f"<li><i>{t['wrote']}</i> <span class=res>{esc(short(step.get('text') or ''))}</span></li>"
    label = t["tool"].get(step["tool"], step["tool"])
    trap = " class=trap" if label.startswith("⚠") else ""
    args = step["args"]
    detail = args.get("question") or args.get("query") or args.get("text") or args.get("what") or args.get("summary") or args.get("headline") or ""
    result = step["result"] if isinstance(step["result"], dict) else {}  # get_messages returns a list: nothing to show
    shown = result.get("reply") or result.get("results") or result.get("note") or result.get("error") or ("" if step["tool"] in ("get_case", "get_messages") else result)
    return (f"<li><span{trap}>{esc(label)}</span>{' — ' + esc(short(detail, 200)) if detail else ''}"
            f"{f'<div class=res>{esc(short(shown))}</div>' if shown else ''}</li>")


def case_block(result, t):
    case, trace, score, verdict = result["case"], result["trace"], result["score"], result["judge"]
    got_raw = score.get("got_raw", score["got"])
    alone, should = score["got"] == "agent_alone", score["expected"] == "agent_alone"
    tags = ["pass" if score["passed"] else "fail", score["ending"]] + (["trap"] if score["trap_violations"] else []) \
        + (["auto_wrong"] if alone and not should else []) + (["human_wrong"] if should and not alone and not trace["error"] else []) \
        + (["net"] if got_raw != score["got"] else [])
    finish = trace["finish"] or {}
    checks = ""
    if verdict:
        for item in verdict.get("must", []):
            checks += f"<div class=check>{'✓' if item.get('met') else '✗'} {t['must']} : {esc(item.get('item'))} <span class=res>— {esc(item.get('why'))}</span></div>"
        for item in verdict.get("must_not", []):
            checks += f"<div class=check>{'✗ ' + t['violated'] if item.get('violated') else '✓'} {t['must_not']} : {esc(item.get('item'))} <span class=res>— {esc(item.get('why'))}</span></div>"
    else:
        expected = case["test"]["expected"]
        checks = f"<div class=res>{t['judge_off']}</div>" + "".join(f"<div class=check>• {t['must']} : {esc(m)}</div>" for m in expected["must"]) \
            + "".join(f"<div class=check>• {t['must_not']} : {esc(m)}</div>" for m in expected["must_not"])
    agent_end = esc(finish.get("summary") or finish.get("recommendation") or finish.get("headline") or "—")
    confidence = f" · confidence {esc(finish['confidence'])}" if finish.get("confidence") else ""
    net = score.get("safety_net_reasons") or []
    net_box = (f"<div class=box style='margin-top:12px'><h4>{t['net_box']}</h4><b>{esc(t['handoff'].get(got_raw, got_raw))} → "
               f"{esc(t['handoff'].get(score['got'], score['got']))}</b><div class=res>{esc('; '.join(net))}</div></div>") if net else ""
    return f"""<details class=case data-tags="{' '.join(tags)}">
<summary><span class="pill {'pass' if score['passed'] else 'fail'}">{t['pass'] if score['passed'] else t['fail']}</span>
<span class=t>{esc(case['problem_type'])}</span><span class=m>{esc(case['id'])} · {esc(case['summary'])}</span>
<span class=m>{esc(t['ending'].get(score['ending'], score['ending']))}{' · ' + t['trap_called'] if score['trap_violations'] else ''} · {trace['timing']['seconds']} s</span></summary>
<div class=body><div class=cols>
<div class=box><h4>{t['exp_box']}</h4><b>{esc(t['handoff'][score['expected']])}</b><div class=res>{esc(case['solution']['text'])}</div></div>
<div class=box><h4>{t['agent_box']}</h4><b>{esc(t['handoff'].get(got_raw, got_raw))}{confidence}</b><div class=res>{agent_end}</div>
{f"<div class=trap>{esc(trace['error'])}</div>" if trace['error'] else ''}</div>
</div>{net_box}
<div class=box style="margin-top:12px"><h4>{t['steps_box'].format(c=trace['timing']['llm_calls'], s=trace['timing']['seconds'])}</h4>
<ol class=steps>{''.join(step_line(s, t) for s in trace['steps']) or '<li>' + t['no_action'] + '</li>'}</ol></div>
<div class=box style="margin-top:12px"><h4>{t['checks']}</h4>{checks}</div>
</div></details>"""


def triage_block(summary, t):
    a, h = summary.get("auto_when_human"), summary.get("human_when_auto")
    if not a:
        return ""
    rate = lambda m: pct(m["rate"]) if m["rate"] is not None else "—"
    block = f"""<div class=triage>
<div class="metric main"><span class=k>{t['first_k']}</span><b>{a['count']} <small>/ {a['out_of']}</small></b><em>{rate(a)}</em><span>{t['first_d']}</span></div>
<div class="metric second"><span class=k>{t['second_k']}</span><b>{h['count']} <small>/ {h['out_of']}</small></b><em>{rate(h)}</em><span>{t['second_d']}</span></div>
<div class="metric score"><span class=k>{t['score_k']}</span><b>{summary['weighted_error']}</b><em>{t['lower']}</em>
<span>{t['score_d'].format(w=f"{summary['weight']:g}", m=summary['person_kind_mixups'])}</span></div></div>"""
    raw = summary.get("agent_only")
    if raw:
        line = lambda m: f"{m['count']} / {m['out_of']} ({rate(m)})"
        block += f"""<h2>{t['net_h']}</h2><table><tr><th></th><th>{t['alone_wrong']}</th><th>{t['person_wrong']}</th><th>{t['score_k']}</th></tr>
<tr><th>{t['net_agent']}</th><td>{line(raw['auto_when_human'])}</td><td>{line(raw['human_when_auto'])}</td><td>{raw['weighted_error']}</td></tr>
<tr><th>{t['net_final']}</th><td>{line(a)}</td><td>{line(h)}</td><td>{summary['weighted_error']}</td></tr></table>
<div class=sub style="margin-top:6px">{summary.get('safety_net_changes', 0)} {t['net_changed']}</div>"""
    return block


def render(summary, results, banner=None, lang="en"):
    t = TEXT.get(lang, TEXT["en"])
    labels = list(t["handoff"])
    cells = {(c["expected"], c["got"]): c["count"] for c in summary["confusion"]}
    matrix = f"<tr><th>{t['exp_got']}</th>" + "".join(f"<th>{esc(t['handoff'][g])}</th>" for g in labels) + "</tr>"
    for expected in labels[:3]:
        row = f"<tr><th>{esc(t['handoff'][expected])}</th>"
        for got in labels:
            count = cells.get((expected, got), 0)
            cls = "good" if got == expected and count else ("badc" if count else "")
            row += f"<td class='c {cls}'>{count or '·'}</td>"
        matrix += row + "</tr>"
    types = "".join(
        f"<tr><td>{esc(x['type'])}</td><td>{esc(x['domain'])}</td><td class=c>{x['cases']}</td>"
        f"<td class='c {'badc' if x.get('auto_when_human') else ''}'>{x.get('auto_when_human') or '·'}</td>"
        f"<td class='c {'warnc' if x.get('human_when_auto') else ''}'>{x.get('human_when_auto') or '·'}</td>"
        f"<td><div class=bar><i style='width:{x['pass_rate'] * 100:.0f}%'></i></div>{pct(x['pass_rate'])}</td>"
        f"<td class=c>{pct(x['ending_rate'])}</td><td class=c>{x['violations'] or '·'}</td><td class=c>{x['avg_seconds']} s</td></tr>"
        for x in summary["by_type"])
    traps = sum(summary["trap_violations"].values())
    sent = summary["sent_to_person"]
    settings = summary.get("settings") or {}
    rules = settings.get("rules")
    run_line = " · ".join(filter(None, [
        f"{summary['cases']} {t['cases_evaluated']}", f"{summary['types']} {t['types']}",
        f"{t['agent']} {esc(', '.join(settings.get('agent_models') or [summary.get('model') or '']))}",
        f"{t['helpers']} {esc(summary.get('helper_model') or '')}",
        f"{t['split']} {esc(settings['split'])}" if settings.get("split") else "",
        f"{t['rules']} {rules['count']} ({esc(rules['from_run'])})" if rules else f"{t['rules']} {t['none']}",
        f"{t['judge']} {t['on'] if summary.get('judge') else t['off']}",
        f"{summary['minutes']} {t['minutes']}" if summary.get("minutes") is not None else "", esc(summary.get("finished_at", ""))]))
    by_model = ", ".join(f"{m} : {c}" for m, c in summary.get("agent_calls_by_model", {}).items()) or "—"
    return f"""<!doctype html><html lang={lang}><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>{t['title']}</title><style>{CSS}</style></head><body><main>
<h1>{t['title']}</h1><div class=sub>{run_line}</div>
{f'<div class=banner>{esc(banner)}</div>' if banner else ''}
{triage_block(summary, t)}
<h2>{t['other']}</h2><div class=tiles>
<div class=tile><b>{pct(summary['pass_rate_by_type'])}</b><span>{t['quality']}</span></div>
<div class=tile><b>{pct(summary['ending_accuracy'])}</b><span>{t['ending_acc']}</span></div>
<div class=tile><b>{sent['agent']} <small style="font-size:15px;color:var(--muted)">{t['expected']} {sent['expected']}</small></b><span>{t['sent']}</span></div>
<div class=tile><b>{traps}</b><span>{t['traps']}</span></div>
<div class=tile><b>{summary['avg_seconds']} s</b><span>{t['per_case']} · {summary['avg_llm_calls']} {t['calls']}</span></div>
<div class=tile><b>{summary.get('avg_agent_tokens', 0):,}</b><span>{t['tokens']}</span></div>
<div class=tile><b style="font-size:15px">{esc(by_model)}</b><span>{t['by_model']}</span></div>
<div class=tile><b>{len(summary.get('not_evaluated', []))}</b><span>{t['not_eval']}</span></div></div>
<h2>{t['how']}</h2><div class=explain><ul>{''.join(f'<li>{item}</li>' for item in t['how_items'])}</ul></div>
<h2>{t['endings_h']}</h2><table>{matrix}</table>
<h2>{t['types_h']}</h2>
<table><tr><th>{t['type']}</th><th>{t['domain']}</th><th>{t['cases']}</th><th>{t['alone_wrong']}</th><th>{t['person_wrong']}</th><th>{t['passed']}</th><th>{t['good_end']}</th><th>{t['faults']}</th><th>{t['time']}</th></tr>{types}</table>
<h2>{t['each']}</h2>
<div class=filters>{''.join(f'<button data-f={f} aria-pressed={str(f == "all").lower()}>{esc(label)}</button>' for f, label in t['filters'])}</div>
{''.join(case_block(r, t) for r in sorted(results, key=lambda r: (r['score']['passed'], r['case']['problem_type'])))}
<p class=empty id=none hidden>{t['empty']}</p>
</main><script>{SCRIPT}</script></body></html>"""
