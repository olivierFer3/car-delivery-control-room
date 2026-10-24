"""Build problems.jsonl: one record per operational problem in Bahn's packet.

A problem is a group of records that point at each other through explicit ids
(an alert, the incident it opened, the work item and agent proposal citing it,
the conversation where it was discussed). Nothing is linked by guessing: two
records only end up in the same problem when one names the other.

Standard library only. Re-run after the packet changes:
    python3 agent/problems/build_bahn.py
"""

import hashlib
import json
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "dataset" / "data"
OUT = Path(__file__).resolve().parent / "data" / "problems.jsonl"
SCHEMA_VERSION = "1.1"
ORIGIN = "bahn_packet"

# Records that describe a problem. Other tables (tracking, events, offers...)
# appear only as evidence references.
def is_seed(table, row):
    return {
        "alerts": True,
        "incidents": True,
        "work_items": True,
        "agent_proposals": True,
        "conversations": True,
        "support_inbox_threads": True,
        "endpoint_claims": True,
        "custody_assets": True,
        "site_visits": row.get("outcome") not in (None, "COLLECTED", "DELIVERED"),
        "proofs": row.get("status") == "REJECTED",
        "documents": row.get("status") == "MISSING",
        "expenses": row.get("status") == "REJECTED",
    }.get(table, False)


# Ordered: the first matching keyword decides the domain of a problem type.
DOMAINS = [
    ("on_the_road", ["SAFETY_STOP", "VEHICLE_WARNING", "TRACKING_GAP", "PROMISE_UNACHIEVABLE", "SCHEDULE_AND_ETA", "VEHICLE_RECOVERY", "SAFE_STOP"]),
    ("costs", ["EXPENSE", "INVOICE", "BILLING", "COSTS", "PAYOUT"]),
    ("pickup_readiness", ["RELEASE"]),
    ("evidence_documents", ["PROOF", "EVIDENCE", "DOCUMENT", "CONDITION", "SIGNED_HANDOVER"]),
    ("driver_travel", ["FERRY", "TRAVEL", "POSITIONING", "CROSSING"]),
    ("dispatch", ["DRIVER_AVAILABILITY", "BACKUP_DRIVER", "DRIVER_START", "MARKET", "OFFER", "ASSIGNMENT"]),
    ("pickup_readiness", ["PICKUP", "SITE_ACCESS", "IDENTITY", "KEY_HOLDER", "KEY_SET", "SITE_HANDOVER", "CUSTODY", "VEHICLE_NOT_FOUND"]),
    ("delivery_handover", ["DELIVERY", "RECEIVER"]),
    ("order_data", ["ORDER_", "CLAIM", "RECEIVING_CONTACT", "ACCESS"]),
    ("support", ["POLICY"]),
]

SAME_EVENT_WINDOW_SECONDS = 2 * 3600
PHASES = {"NEW": "intake", "WAITING_FOR_PICKUP": "before_pickup", "IN_TRANSIT": "in_transit", "DELIVERED": "after_delivery"}
SEVERITY_RANK = {"low": 1, "medium": 2, "high": 3, "critical": 4}


def load_all():
    tables = {}
    for path in sorted(DATA.glob("*.jsonl")):
        with path.open(encoding="utf-8") as handle:
            tables[path.stem] = [json.loads(line) for line in handle if line.strip()]
    return tables


def parse(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def refs_in(value):
    """Every record id named inside a field: plain strings, lists, or {table, id} objects."""
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        if "id" in value and "table" in value:
            yield value["id"]
        else:
            for item in value.values():
                yield from refs_in(item)
    elif isinstance(value, list):
        for item in value:
            yield from refs_in(item)


LINK_FIELDS = [
    "conversation_id", "related_work_item_id", "latest_site_conversation_id", "evidence_refs", "decision_evidence_refs",
    "resolution_evidence_refs", "triage_basis_message_id", "resolution_message_id", "driver_report_message_id",
    "related_record_ids", "source_refs", "alert_id", "target_id", "resolution_basis_message_ids", "source_id",
    "current_source_refs", "candidate_basis_message_id", "follows_conversation_id",
]


class Groups:
    def __init__(self):
        self.parent = {}

    def find(self, key):
        self.parent.setdefault(key, key)
        while self.parent[key] != key:
            self.parent[key] = self.parent[self.parent[key]]
            key = self.parent[key]
        return key

    def join(self, a, b):
        self.parent[self.find(a)] = self.find(b)


def build():
    tables = load_all()
    snapshot_at = json.loads((DATA / "manifest.json").read_text())["snapshot_at"]
    where = {row["id"]: table for table, rows in tables.items() for row in rows if isinstance(row, dict) and "id" in row}
    by_id = {row["id"]: row for rows in tables.values() for row in rows if isinstance(row, dict) and "id" in row}
    message_thread = {m["id"]: m["conversation_id"] for m in tables["messages"]}
    message_thread.update({m["id"]: m["thread_id"] for m in tables["support_inbox_messages"] if "thread_id" in m})

    seeds = [(table, row) for table, rows in tables.items() for row in rows if isinstance(row, dict) and is_seed(table, row)]
    seed_ids = {row["id"] for _, row in seeds}
    groups = Groups()
    evidence = {}
    links = []
    for table, row in seeds:
        groups.find(row["id"])
        named = {ref for field in LINK_FIELDS for ref in refs_in(row.get(field))}
        evidence[row["id"]] = named
        for ref in named:
            # A message stands for its thread: citing a message links the conversation it belongs to.
            target = message_thread.get(ref, ref)
            if target in seed_ids and target != row["id"]:
                groups.join(row["id"], target)
                links.append({"from": row["id"], "to": target, "basis": "explicit_reference"})

    # Incidents and site visits often name no alert, though they describe the same
    # event. Join one to the alert on the same driver assignment raised closest in
    # time, and only within the window, so an older unrelated signal stays apart.
    alerts_by_assignment = {}
    for alert in tables["alerts"]:
        alerts_by_assignment.setdefault(alert.get("assignment_id"), []).append(alert)
    for table, row in seeds:
        if table not in ("incidents", "site_visits") or not row.get("assignment_id"):
            continue
        at = parse(row.get("opened_at") or row.get("arrived_at"))
        near = [(abs((parse(a["triggered_at"]) - at).total_seconds()), a) for a in alerts_by_assignment.get(row["assignment_id"], [])]
        near = [pair for pair in near if pair[0] <= SAME_EVENT_WINDOW_SECONDS]
        if near:
            alert = min(near, key=lambda pair: pair[0])[1]
            groups.join(row["id"], alert["id"])
            links.append({"from": row["id"], "to": alert["id"], "basis": "same_assignment_within_2h"})

    members = {}
    for table, row in seeds:
        members.setdefault(groups.find(row["id"]), []).append((table, row))

    orders = {o["id"]: o for o in tables["orders"]}
    items = {}
    for item in tables["order_items"]:
        if item["role"] == "PRIMARY":
            items[item["order_id"]] = by_id.get(item["vehicle_id"])
    messages_by_thread = {}
    for m in tables["messages"]:
        messages_by_thread.setdefault(m["conversation_id"], []).append(m)
    for m in tables["support_inbox_messages"]:
        messages_by_thread.setdefault(m.get("thread_id"), []).append(m)

    problems = [problem(group, orders, items, messages_by_thread, where, evidence, snapshot_at, links) for group in members.values()]
    problems.sort(key=lambda p: (p["status"] != "open", -SEVERITY_RANK.get(p["severity"] or "", 0), p["opened_at"] or ""))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8") as handle:
        for record in problems:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
    return problems


def first(rows, table):
    return next((row for t, row in rows if t == table), None)


def all_of(rows, table):
    return [row for t, row in rows if t == table]


def problem_type(rows):
    for table, field in (("incidents", "kind"), ("alerts", "signal"), ("work_items", "kind"), ("custody_assets", "kind"),
                         ("endpoint_claims", "field"), ("support_inbox_threads", "category"), ("site_visits", "outcome")):
        row = first(rows, table)
        if row and row.get(field):
            return str(row[field]).upper()
    for table, code in (("proofs", "PROOF_REJECTED"), ("documents", "DOCUMENT_MISSING"), ("expenses", "EXPENSE_REJECTED")):
        if first(rows, table):
            return code
    proposal = first(rows, "agent_proposals")
    if proposal:
        return proposal["command"].upper().replace(".", "_")
    conversation = first(rows, "conversations")
    return conversation["category"].upper() if conversation else "UNKNOWN"


def domain_of(code):
    for domain, words in DOMAINS:
        if any(word in code for word in words):
            return domain
    return "other"


def is_open(table, row):
    status = row.get("status")
    return {
        "alerts": status in ("OPEN", "ACKNOWLEDGED"),
        "incidents": not row.get("resolved_at"),
        "work_items": status in ("OPEN", "NEEDS_EXTERNAL_INPUT"),
        "agent_proposals": status in ("PENDING_REVIEW", "APPROVED_AWAITING_EXECUTION", "FAILED"),
        "conversations": status == "OPEN",
        "support_inbox_threads": status == "OPEN",
        "endpoint_claims": not row.get("resolved_at"),
        "custody_assets": status not in ("VERIFIED", "CLOSED"),
        "site_visits": False,
        "proofs": True,
        "documents": True,
        "expenses": False,
    }.get(table, False)


TIME_FIELDS = ("triggered_at", "opened_at", "created_at", "started_at", "recorded_at", "arrived_at", "submitted_at", "updated_at", "service_at")
END_FIELDS = ("resolved_at", "closed_at", "reviewed_at", "left_at")


def problem(rows, orders, items, messages_by_thread, where, evidence, snapshot_at, links):
    seed_ids = sorted(row["id"] for _, row in rows)
    in_group = set(seed_ids)
    order_ids = sorted({row["order_id"] for _, row in rows if row.get("order_id")})
    for thread in all_of(rows, "support_inbox_threads"):
        order_ids += [oid for oid in thread.get("linked_order_ids", []) if oid not in order_ids]
    order = orders.get(order_ids[0]) if order_ids else None
    vehicle = items.get(order["id"]) if order else None
    code = problem_type(rows)

    started = [row[f] for _, row in rows for f in TIME_FIELDS if row.get(f)]
    ended = [row[f] for _, row in rows for f in END_FIELDS if row.get(f)]
    still_open = any(is_open(table, row) for table, row in rows)

    severities = [row["severity"] for row in all_of(rows, "alerts") if row.get("severity")]
    severities += [row["priority"] for row in all_of(rows, "work_items") if row.get("priority") in SEVERITY_RANK]
    severity = max(severities, key=lambda s: SEVERITY_RANK[s]) if severities else None

    summaries = [row.get("summary") for row in all_of(rows, "alerts") + all_of(rows, "work_items") + all_of(rows, "agent_proposals")]
    summaries += [row.get("reported_symptom") for row in all_of(rows, "incidents")]
    summaries += [f'Driver visit at the site ended with {row["outcome"].lower().replace("_", " ")}.' for row in all_of(rows, "site_visits")]
    summaries += [f'Incident {row["kind"].lower().replace("_", " ")}, {row["status"].lower().replace("_", " ")}.' for row in all_of(rows, "incidents")]
    summaries += [row.get("claim") for row in all_of(rows, "endpoint_claims")] + [row.get("candidate_basis") for row in all_of(rows, "support_inbox_threads")]
    summaries += [row.get("review_note") for row in all_of(rows, "proofs") + all_of(rows, "expenses")] + [row.get("label") for row in all_of(rows, "custody_assets")]

    thread_ids = [row["id"] for row in all_of(rows, "conversations") + all_of(rows, "support_inbox_threads")]
    timeline = sorted((m for tid in thread_ids for m in messages_by_thread.get(tid, [])), key=lambda m: m.get("authored_at") or m.get("sent_at") or "")
    if not summaries or not any(summaries):
        summaries = [timeline[0]["body"][:240]] if timeline else []

    linked = set().union(*(evidence[i] for i in seed_ids)) - set(seed_ids)
    record = {
        "id": "bahn-" + hashlib.sha1("|".join(seed_ids).encode()).hexdigest()[:12],
        "schema_version": SCHEMA_VERSION,
        "source": {
            "origin": ORIGIN, "snapshot_at": snapshot_at,
            "records": [{"table": t, "id": row["id"]} for t, row in sorted(rows, key=lambda r: (r[0], r[1]["id"]))],
            "grouping": [link for link in links if link["from"] in in_group],
        },
        "order": order and {
            "id": order["id"], "reference": order["reference"], "status": order["status"], "route_kind": order["route_kind"],
            "vehicle": vehicle and f'{vehicle["make"]} {vehicle["model"]}',
        },
        "related_order_ids": [oid for oid in order_ids[1:]],
        "problem_type": code,
        "domain": domain_of(code),
        "phase": ("cancelled" if order and order.get("cancelled_at") else PHASES.get(order["status"], "unknown")) if order else "no_order_link",
        "severity": severity,
        "status": "open" if still_open else "resolved",
        "opened_at": min(started) if started else None,
        "resolved_at": None if still_open else (max(ended) if ended else None),
        "summary": next((s for s in summaries if s), None),
        "owners": sorted({row[k] for _, row in rows for k in ("owner", "followup_owner", "work_owner") if row.get(k)}),
        "waiting_on": sorted({row["waiting_on"] for _, row in rows if row.get("waiting_on")}),
        "next_actions": [
            {"text": row["next_action"], "source": {"table": t, "id": row["id"]}}
            for t, row in rows if row.get("next_action")
        ],
        "agent_work": [{
            "proposal_id": p["id"], "agent_id": p.get("proposed_by_agent_id"), "command": p["command"], "summary": p.get("summary"),
            "rationale": p.get("rationale"), "status": p["status"], "proposed_payload": p.get("proposed_payload"),
        } for p in all_of(rows, "agent_proposals")],
        "human_decisions": [{
            "proposal_id": p["id"], "decision": p["review"]["decision"], "note": p["review"].get("decision_note"),
            "by": p["review"].get("reviewer_id"), "at": p["review"].get("reviewed_at"), "final_payload": p["review"].get("final_payload"),
        } for p in all_of(rows, "agent_proposals") if p.get("review")],
        "resolution": resolution(rows),
        "timeline": [{
            "message_id": m["id"], "at": m.get("authored_at") or m.get("sent_at"), "from_type": m.get("author_type"), "from_id": m.get("author_id"),
            "to_type": m.get("recipient_type"), "to_id": m.get("recipient_id"), "channel": m.get("channel"),
            "visibility": m.get("visibility"), "language": m.get("language"), "text": m.get("body"),
        } for m in timeline],
        "evidence_refs": sorted(({"table": where.get(ref, "unknown"), "id": ref} for ref in linked if ref in where), key=lambda r: (r["table"], r["id"])),
    }
    record["solution"] = solution(record)
    return record


def readable(text):
    """PENDING_CUSTOMER -> Pending customer; free text stays as written."""
    return text.replace("_", " ").capitalize() if text.isupper() else text


def solution(problem):
    """What was done (resolved) or what the record says to do next (open), only from recorded text.

    applied: the problem is resolved and the records say how.
    planned: the problem is open and an operator wrote the next step, or a person approved an agent proposal.
    none:    nothing in the records says how to solve it; never invented.
    """
    decisions = [
        (f'{d["decision"].capitalize()} by {d["by"]}: {d["note"]}', {"table": "agent_proposals", "id": d["proposal_id"]})
        for d in problem["human_decisions"] if d["decision"] != "REJECTED" and d["note"]
    ]
    replies = [m for m in problem["timeline"] if m["from_type"] == "operator" and m["visibility"] != "INTERNAL" and m["text"]]
    last_reply = replies and [(replies[-1]["text"], {
        "table": "support_inbox_messages" if replies[-1]["message_id"].startswith("inboxmsg-") else "messages", "id": replies[-1]["message_id"],
    })]
    if problem["status"] == "resolved":
        # A site visit outcome says what went wrong, not how it was fixed.
        parts = [(readable(r["text"]), r["source"]) for r in problem["resolution"] if r["source"]["table"] != "site_visits"]
        parts += decisions + (last_reply or [])
        status = "applied"
    else:
        parts = [(a["text"], a["source"]) for a in problem["next_actions"]] + decisions
        status = "planned"
    if not parts:
        return {"status": "none", "text": None, "sources": []}
    return {"status": status, "text": " ".join(text.rstrip(".") + "." for text, _ in parts), "sources": [source for _, source in parts]}


def resolution(rows):
    found = []
    for t, row in rows:
        text = (row.get("resolution_reason") or row.get("outcome") if t in ("alerts", "work_items", "site_visits") else None) \
            or (row.get("resolution_status") if t == "endpoint_claims" else None) \
            or (row.get("recovery_decision") if t == "incidents" else None) \
            or ((row.get("resolution") or {}).get("decision") if t == "support_inbox_threads" else None) \
            or (row.get("review_note") if t == "expenses" else None)
        if text:
            found.append({"text": text, "at": row.get("resolved_at") or row.get("closed_at") or row.get("reviewed_at")
                          or (row.get("resolution") or {}).get("decided_at"), "source": {"table": t, "id": row["id"]}})
    return found


if __name__ == "__main__":
    built = build()
    open_count = sum(p["status"] == "open" for p in built)
    print(f"{len(built)} problems ({open_count} open) -> {OUT.relative_to(ROOT)}")
