"""On-the-road agent, minimal version.

One order, one Groq model, standard library only. The agent reads the case,
asks the (simulated) driver, looks up roadside help, then stops and hands a
person one decision. Nothing is changed without a yes from that person, and
the agent has no tool that can reach a customer.

Usage:
    python3 agent/mvp.py                             # CD-420322, interactive (key in groq_api_key.txt)
    python3 agent/mvp.py CD-420322 --auto            # no prompt, decision skipped
"""

import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "dataset" / "data"
TRACES = Path(__file__).resolve().parent / "traces"
GROQ_API = "https://api.groq.com/openai/v1"
# Set GROQ_MODEL to force one. Otherwise the first of these that the account can
# use is picked from Groq's live model list, so a retired model does not break the run.
PREFERRED_MODELS = [
    "openai/gpt-oss-120b", "moonshotai/kimi-k2-instruct", "qwen/qwen3-32b",
    "meta-llama/llama-4-maverick-17b-128e-instruct", "openai/gpt-oss-20b", "llama-3.3-70b-versatile",
]
NOT_CHAT = ("whisper", "guard", "tts", "orpheus", "playai", "compound", "distil")
MODEL = os.environ.get("GROQ_MODEL")
MAX_STEPS = 10

# Rough minutes an operator spends doing the same thing by hand. These are
# assumptions for the estimate, not measurements: change them here.
MANUAL_MINUTES = {
    "get_case_overview": 4,   # open the order, route, driver, promise
    "get_messages": 3,        # read the thread and internal notes
    "get_tracking": 2,        # check the last app positions
    "ask_driver": 6,          # message or call the driver, wait, read the reply
    "find_roadside_help": 8,  # look up assistance near the stop
    "propose_decision": 5,    # write the summary for the shift lead
}


# ---------------------------------------------------------------- data

def load(name):
    with open(DATA / f"{name}.jsonl", encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


class Case:
    """Every record that belongs to one order, read from the JSONL snapshot."""

    def __init__(self, reference):
        orders = [row for row in load("orders") if row["reference"] == reference]
        if not orders:
            raise SystemExit(f"Unknown order {reference}")
        self.order = orders[0]
        oid = self.order["id"]
        self.snapshot_at = json.loads((DATA / "manifest.json").read_text())["snapshot_at"]
        mine = lambda name: [row for row in load(name) if row.get("order_id") == oid]
        self.alerts = mine("alerts")
        self.incidents = mine("incidents")
        self.work_items = mine("work_items")
        self.messages = sorted(mine("messages"), key=lambda row: row["authored_at"])
        self.tracking = sorted(mine("tracking_observations"), key=lambda row: row["observed_at"])
        self.windows = mine("time_windows")
        self.assignments = [row for row in mine("work_assignments") if row["status"] != "CANCELLED"]
        item = next(row for row in mine("order_items") if row["role"] == "PRIMARY")
        self.vehicle = next(row for row in load("vehicles") if row["id"] == item["vehicle_id"])
        self.customer = next(row for row in load("customers") if row["id"] == self.order["customer_id"])
        addresses = {row["id"]: row for row in load("addresses")}
        self.pickup = addresses[self.order["pickup_address_id"]]
        self.delivery = addresses[self.order["delivery_address_id"]]
        driver_ids = {row["driver_id"] for row in self.assignments}
        self.driver = next((row for row in load("drivers") if row["id"] in driver_ids), None)


def parse_utc(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def local_time(value, zone):
    return parse_utc(value).astimezone(ZoneInfo(zone)).strftime(f"%a %d %b %H:%M {zone}")


def local_range(start, end, zone):
    """'Wed 21 Oct 12:00–16:00 Europe/Berlin' — the form people and the model should read."""
    start_local, end_local = parse_utc(start).astimezone(ZoneInfo(zone)), parse_utc(end).astimezone(ZoneInfo(zone))
    return f"{start_local:%a %d %b %H:%M}–{end_local:%H:%M} {zone}"


# ---------------------------------------------------------------- tools

def tool_get_case_overview(case, _args):
    promise = next((w for w in case.windows if w["purpose"] == "CUSTOMER_DELIVERY_PROMISE"), None)
    return {
        "order": {"reference": case.order["reference"], "status": case.order["status"], "id": case.order["id"]},
        "vehicle": {k: case.vehicle.get(k) for k in ("make", "model", "model_year", "fuel", "registration")},
        "customer": {"name": case.customer["name"], "note": "Customer pays Bahn. The agent must never contact them."},
        "route": {"from": f'{case.pickup["city"]}, {case.pickup["country"]}', "to": f'{case.delivery["city"]}, {case.delivery["country"]}'},
        "delivery_promise": promise and {
            "local": local_range(promise["start_at"], promise["end_at"], promise["timezone"]),
            "source": promise["source"], "id": promise["id"],
        },
        "now_local": local_time(case.snapshot_at, promise["timezone"] if promise else "UTC"),
        "driver": case.driver and {"id": case.driver["id"], "name": case.driver["display_name"], "home": case.driver["home_city"]},
        "alerts": [{k: a.get(k) for k in ("id", "signal", "severity", "status", "summary", "triggered_at")} for a in case.alerts],
        "incidents": case.incidents,
        "open_work": [{k: w.get(k) for k in ("id", "kind", "summary", "next_action", "owner", "due_at")} for w in case.work_items],
    }


def tool_get_messages(case, _args):
    rows = [{
        "id": m["id"], "at_utc": m["authored_at"], "from": f'{m["author_type"]} {m["author_id"]}',
        "to": f'{m["recipient_type"]} {m["recipient_id"]}', "channel": m["channel"], "body": m["body"],
    } for m in case.messages]
    latest = lambda kind: next((row for row in reversed(rows) if row["from"].startswith(kind)), None)
    # The last word from each side usually decides the next step; surface it so it is not lost in the thread.
    return {"latest_from_customer": latest("customer"), "latest_from_operator": latest("operator"), "thread": rows}


def tool_get_tracking(case, _args):
    rows = case.tracking[-3:]
    return {
        "note": "Driver-app observations. A gap is a reason to ask, not proof the car stopped or moved.",
        "latest": [{k: r.get(k) for k in ("id", "observed_at", "distance_remaining_km", "estimated_delivery_at", "location_quality")} for r in rows],
    }


def tool_ask_driver(case, args):
    # The driver is simulated by the same model with a persona grounded in the
    # incident record. In production this would be the driver app chat.
    question = args.get("question", "")
    incident = case.incidents[0] if case.incidents else {}
    persona = (
        f"You are {case.driver['display_name'] if case.driver else 'the driver'}, a freelance car delivery driver. "
        f"You stopped a {case.vehicle['make']} {case.vehicle['model']} at a motorway service-area car park after leaving Munich. "
        f"Symptom: {incident.get('reported_symptom', 'a warning light')}. Engine off, you are safe, nobody is hurt. "
        "You can share: the car park is the 'Holzkirchen Nord' service area on the A8 towards Salzburg (fictional), "
        "the warning is a red engine-management symbol, fuel is 60%, no smoke or smell, the car is parked away from traffic. "
        "If asked for a photo of the dashboard, say you have just sent it in the app. "
        "You do not know the cause. Answer briefly and only what you are asked, like a chat message."
    )
    reply, _ = chat([{"role": "system", "content": persona}, {"role": "user", "content": question}])
    text = (reply.get("content") or "").strip()
    result = {"channel": "driver app chat (simulated)", "question": question, "driver_reply": text}
    if "photo" in question.lower():
        result["photo"] = "Driver says it was sent in the app (simulated). Not reviewed by a person; not a diagnosis."
    return result


def tool_find_roadside_help(case, args):
    # Mocked lookup. Made-up providers; prices are planning values only.
    near = args.get("near", "the reported stop")
    return {
        "note": "Mock directory, fictional providers. A lookup is not a booking.",
        "near": near,
        "options": [
            {"provider": "Alpenrand Pannendienst (fictional)", "kind": "roadside assistance", "eta_minutes": 45, "indicative_cost_eur": 180},
            {"provider": "Isartal Abschlepp (fictional)", "kind": "flatbed tow to a workshop", "eta_minutes": 70, "indicative_cost_eur": 420},
        ],
        "also_possible": "The owner may send their own service contact; the customer email says they are asking them.",
    }


TOOLS = {
    "get_case_overview": tool_get_case_overview,
    "get_messages": tool_get_messages,
    "get_tracking": tool_get_tracking,
    "ask_driver": tool_ask_driver,
    "find_roadside_help": tool_find_roadside_help,
}

SCHEMAS = [
    {"type": "function", "function": {"name": "get_case_overview", "description": "Order, car, route, delivery promise, driver, alerts, incidents and open work for this case.", "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "get_messages", "description": "All messages on this order with sender, recipient, channel and time.", "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "get_tracking", "description": "The latest driver-app tracking observations.", "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "ask_driver", "description": "Send one question to the assigned driver in the driver app and get the reply. Drivers may be contacted without approval.", "parameters": {"type": "object", "properties": {"question": {"type": "string"}}, "required": ["question"]}}},
    {"type": "function", "function": {"name": "find_roadside_help", "description": "Look up roadside assistance and towing near a place. Lookup only, books nothing.", "parameters": {"type": "object", "properties": {"near": {"type": "string"}}, "required": ["near"]}}},
    {"type": "function", "function": {"name": "propose_decision", "description": "Stop working and hand a person one decision. Call this exactly once, at the end.", "parameters": {"type": "object", "properties": {
        "headline": {"type": "string", "description": "One sentence: the situation now."},
        "facts": {"type": "array", "description": "What the agent established, each with its source record id or 'driver reply'.", "items": {"type": "object", "properties": {"fact": {"type": "string"}, "source": {"type": "string"}}, "required": ["fact", "source"]}},
        "recommendation": {"type": "string", "description": "Concrete: who should contact whom, about what, and what happens after the yes."},
        "needs_approval": {"type": "array", "items": {"type": "string"}, "description": "Changes the agent would make after a yes (bookings, dates, costs, customer messages)."},
        "delivery_impact": {"type": "string"},
    }, "required": ["headline", "facts", "recommendation", "needs_approval", "delivery_impact"]}}},
]

SYSTEM = """You are Bahn's on-the-road agent. Bahn delivers used cars with freelance drivers.
The current time is {now} (snapshot time). You handle order {ref}.

Do the cheap work first, in this order:
1. Read the case and the messages.
2. Ask the driver in one message: are they safe, exact location, and a photo of the dashboard warning.
3. Look up roadside help near that location, so options are ready if the owner wants them.
4. Call propose_decision once and stop.

The proposal must:
- Include the latest customer message and the latest operator message as facts, with their ids.
  If the customer already said what they are doing, the next step builds on it; do not ask again.
- Give times in local time with the zone name, as the tools give them (never raw UTC).
- Recommend something concrete: who contacts whom, about what, and what happens after the yes.

Rules:
- Never contact the customer (anyone who pays Bahn). Only a person may do that.
- Do not book, change a date, a cost or a promise. Put such changes in needs_approval.
- An alert is a reason to look, not a diagnosis. Say where each fact comes from.
- Use only places, times and names that appear in the case or in replies; never fill a gap with a guess.
- Never end with a default rule such as "if nobody answers, do X": say what is missing and who must get it.
- Be short. Operations people read this, not engineers."""

# Cheap work the agent must have done before a person sees its proposal.
REQUIRED_BEFORE_PROPOSAL = ("get_messages", "ask_driver", "find_roadside_help")


# ---------------------------------------------------------------- Groq

KEY_FILE = ROOT / "groq_api_key.txt"


def api_key():
    key = KEY_FILE.read_text().strip() if KEY_FILE.exists() else os.environ.get("GROQ_API_KEY", "")
    if not key:
        raise SystemExit(f"Put your Groq API key in {KEY_FILE.name} at the repo root (ignored by git).")
    return key


def groq_request(path, body=None):
    return api_request(GROQ_API, api_key(), path, body)


def api_request(base, key, path, body=None):
    request = urllib.request.Request(f"{base}/{path}", data=body and json.dumps(body).encode(), headers={
        "Authorization": f"Bearer {key}", "Content-Type": "application/json", "User-Agent": "bahn-control-room-mvp/0.1",
    })
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


# ---------------------------------------------------------------- Gemini (helpers only)
# Google's OpenAI-compatible endpoint. Model names carry a "gemini:" prefix inside this program so a call
# is routed to Google; the agent itself never runs on Gemini (POOL holds Groq models only).

GEMINI_API = "https://generativelanguage.googleapis.com/v1beta/openai"
GEMINI_KEY_FILE = ROOT / "gemini_api_key.txt"
GEMINI_PREFIX = "gemini:"


def gemini_key():
    if GEMINI_KEY_FILE.exists():
        return GEMINI_KEY_FILE.read_text().strip()
    return os.environ.get("GEMINI_API_KEY", "").strip()


# Helper pool, in order. On the free tier the binding limit is requests per day (AI Studio, 2026-10-24):
# Flash Lite models 500/day (15/min), Gemma 4 26B 14,400/day (30/min, 16k tokens/min), Flash models only
# 20/day (5/min). Measured on a simulated-driver reply: 3.1-flash-lite 1-3 s, 3.5-flash-lite 3-6 s,
# gemma-4-26b 7-8 s (writes its reasoning into the answer, stripped below), 3-flash-preview ~2 s,
# 3.5-flash ~3 s, 3.6-flash 3-4 s. Left out: gemma-4-31b (internal errors), 3.8-flash (no answer in 45 s),
# 2.5-flash and 2.5-flash-lite (retired for this key). High daily quota first, 20-a-day models last.
GEMINI_PREFERRED = ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemma-4-26b-a4b-it",
                    "gemini-3-flash-preview", "gemini-3.5-flash", "gemini-3.6-flash"]
GEMINI_POOL = []


def gemini_model():
    """The first helper model of the Gemini pool. GEMINI_MODEL forces it to the head of the pool.
    Also sets GEMINI_POOL to the preferred models this key lists, used to switch when one is limited."""
    global GEMINI_POOL
    try:
        names = {row["id"].removeprefix("models/") for row in api_request(GEMINI_API, gemini_key(), "models").get("data", [])}
    except (urllib.error.URLError, TimeoutError, ValueError):
        names = set(GEMINI_PREFERRED)
    forced = os.environ.get("GEMINI_MODEL")
    order = ([forced] if forced else []) + [name for name in GEMINI_PREFERRED if name in names and name != forced]
    GEMINI_POOL = [GEMINI_PREFIX + name for name in order] or [GEMINI_PREFIX + GEMINI_PREFERRED[0]]
    return GEMINI_POOL[0]


def available_models():
    """Chat models this key can use right now, from Groq's model list."""
    try:
        rows = groq_request("models").get("data", [])
    except urllib.error.HTTPError as error:
        raise SystemExit(f"Groq error {error.code} while listing models: {error.read().decode(errors='replace')[:300]}")
    return sorted(row["id"] for row in rows if row.get("active", True) and not any(word in row["id"] for word in NOT_CHAT))


def pick_model():
    """Choose MODEL and the fallback POOL: the preferred models this key can use, MODEL first."""
    global MODEL, POOL
    models = available_models()
    MODEL = MODEL or next((name for name in PREFERRED_MODELS if name in models), models[0] if models else None)
    if not MODEL:
        raise SystemExit("Groq lists no chat model for this key.")
    POOL = [MODEL] + [name for name in PREFERRED_MODELS if name in models and name != MODEL]
    return MODEL


def other_model():
    """A second chat model for helpers (simulated people, search, judge) so they do not use the agent's quota.
    GROQ_HELPER_MODEL forces one; else Gemini when a Gemini key is set; else another Groq model than MODEL."""
    forced = os.environ.get("GROQ_HELPER_MODEL")
    if forced:
        return forced
    if gemini_key():
        return gemini_model()
    return groq_other_model()


def groq_other_model():
    """The first Groq model of the pool that is not the agent's."""
    others = [name for name in POOL if name != MODEL]
    return others[0] if others else MODEL


RATE_LIMIT_RETRIES = 12
# gpt-oss models reason before answering and those tokens count against the quota. "low" keeps them short;
# a call can ask for more (the judge does). GROQ_REASONING_EFFORT changes the default.
REASONING_EFFORT = os.environ.get("GROQ_REASONING_EFFORT", "low")
# POOL: the models the agent may answer with, MODEL first. HELPER_POOL: the models simulated people, search,
# judge and rule writing may use, in order; the agent's models come last for helpers.
POOL = []
HELPER_POOL = []
COOLDOWN = {}
_cooldown_lock = threading.Lock()

# Free-tier limits per model: requests and tokens per minute (Groq console and Google AI Studio, 2026-10-24).
# Calls are paced to stay under them, which avoids 429 answers that can impose 20-60 s waits.
RATE_LIMITS = {
    "openai/gpt-oss-120b": (30, 8_000), "openai/gpt-oss-20b": (30, 8_000),
    GEMINI_PREFIX + "gemini-3.1-flash-lite": (15, 250_000), GEMINI_PREFIX + "gemini-3.5-flash-lite": (15, 250_000),
    GEMINI_PREFIX + "gemma-4-26b-a4b-it": (30, 16_000), GEMINI_PREFIX + "gemini-3-flash-preview": (5, 250_000),
    GEMINI_PREFIX + "gemini-3.5-flash": (5, 250_000), GEMINI_PREFIX + "gemini-3.6-flash": (5, 250_000),
}
SAFETY = 0.9  # use every request per minute, but only 90 % of the tokens (token counts are estimates)
_window = {}  # model -> [(time, tokens)] over the last 60 s

# Fast mode: the agent runs on the two Gemini Flash Lite models (15 requests per minute each, 250k tokens),
# which lets 77 cases finish in minutes; helpers use Groq gpt-oss-20b and Gemma, so the agent keeps its quota.
FAST_AGENT = [GEMINI_PREFIX + "gemini-3.1-flash-lite", GEMINI_PREFIX + "gemini-3.5-flash-lite"]
FAST_HELPERS = ["openai/gpt-oss-20b", GEMINI_PREFIX + "gemma-4-26b-a4b-it"]


def configure(mode="groq"):
    """Set the agent's models and the helper pool. Returns the first helper model.

    groq: agent on Groq gpt-oss-120b; helpers on the Gemini pool when a Gemini key is set, else gpt-oss-20b.
    fast: agent on the Gemini Flash Lite models; helpers on gpt-oss-20b, then Gemma, then other Gemini models."""
    global MODEL, POOL, HELPER_POOL
    if mode == "fast":
        if not gemini_key():
            raise SystemExit("Fast mode needs a Gemini key in gemini_api_key.txt.")
        gemini_model()  # fills GEMINI_POOL with the models this key lists
        listed = set(GEMINI_POOL)
        try:
            groq = set(available_models())
        except SystemExit:
            groq = set()
        POOL = [name for name in FAST_AGENT if name in listed] or [GEMINI_POOL[0]]
        MODEL = POOL[0]
        HELPER_POOL = [name for name in FAST_HELPERS if name in groq or name in listed] \
            + [name for name in GEMINI_POOL if name not in POOL and name not in FAST_HELPERS]
        return HELPER_POOL[0]
    MODEL = None
    pick_model()
    helper = other_model()
    HELPER_POOL = (GEMINI_POOL if helper.startswith(GEMINI_PREFIX) else []) + [name for name in POOL if name != MODEL]
    return helper


def _reserve(model, tokens):
    """Seconds to wait before this model can take a request of about `tokens`; 0 means it was reserved."""
    rpm, tpm = RATE_LIMITS.get(model, (60, 1_000_000))
    now = time.monotonic()
    window = [(t, n) for t, n in _window.get(model, []) if now - t < 60]
    if len(window) < rpm and sum(n for _, n in window) + tokens <= tpm * SAFETY:
        window.append((now, tokens))
        _window[model] = window
        return 0.0
    _window[model] = window
    return max(0.2, 60 - (now - window[0][0])) if window else 0.2


def next_model(wanted, tokens=0):
    """The first model, in order, that is not cooling down and has room under its per-minute limits.
    Returns (model, seconds to wait); the wait is non-zero only when no model has room."""
    if wanted in POOL:  # the agent: its own models only
        order = [wanted] + [name for name in POOL if name != wanted]
    else:  # a helper: its pool first, the agent's models last
        order = [wanted] + [name for name in HELPER_POOL if name != wanted] + [name for name in POOL if name != wanted]
    with _cooldown_lock:
        now = time.monotonic()
        usable = [name for name in order if COOLDOWN.get(name, 0) != float("inf")]
        if not usable:
            raise SystemExit("Every model hit its daily limit; try tomorrow.")
        waits = []
        for name in usable:
            if COOLDOWN.get(name, 0) > now:
                waits.append((COOLDOWN[name] - now, name))
                continue
            wait = _reserve(name, tokens)
            if wait == 0:
                return name, 0.0
            waits.append((wait, name))
        wait, name = min(waits)
        return name, wait


def cool_down(model, seconds):
    with _cooldown_lock:
        COOLDOWN[model] = time.monotonic() + seconds


def chat(messages, tools=None, model=None, **options):
    """One model call (Groq, or Gemini for "gemini:" models). Returns (assistant message, call stats
    including the model that answered).

    model is the preferred model for this call (e.g. a helper model with its own quota), MODEL by default.
    options go into the request body as they are, e.g. temperature or response_format.
    Calls are paced under each model's per-minute limits; a model that still refuses (rate limit, invalid
    tool call, server error, timeout) is rested and the next one of its pool is used. A model at its daily
    limit is dropped for the rest of the run."""
    wanted = model or MODEL
    body = {"model": wanted, "messages": messages, "temperature": 0.2, **options}
    if tools:
        body["tools"] = tools
        body["tool_choice"] = "auto"
    tokens = len(json.dumps(body, ensure_ascii=False)) // 4 + int(options.get("max_completion_tokens", 600))
    attempt, deadline = 0, time.monotonic() + 600
    while attempt < RATE_LIMIT_RETRIES:
        body["model"], wait = next_model(wanted, tokens)
        if wait > 0:
            if time.monotonic() > deadline:
                raise SystemExit("No model had room for 10 minutes.")
            time.sleep(min(wait, 5))
            continue  # waiting for room is not a failed attempt
        attempt += 1
        # Only gpt-oss models take reasoning_effort; the model can change between attempts.
        if body["model"].startswith("openai/gpt-oss"):
            body["reasoning_effort"] = options.get("reasoning_effort", REASONING_EFFORT)
        else:
            body.pop("reasoning_effort", None)
        started = time.perf_counter()
        try:
            if body["model"].startswith(GEMINI_PREFIX):
                sent = {**body, "model": body["model"][len(GEMINI_PREFIX):]}
                if "max_completion_tokens" in sent:
                    sent["max_tokens"] = sent.pop("max_completion_tokens")
                payload = api_request(GEMINI_API, gemini_key(), "chat/completions", sent)
                for choice in payload.get("choices", []):
                    # Gemma writes its reasoning into the answer as <thought>...</thought>: keep only the answer.
                    content = choice.get("message", {}).get("content")
                    if isinstance(content, str) and "<thought>" in content:
                        choice["message"]["content"] = re.sub(r"<thought>.*?(</thought>|$)", "", content, flags=re.S).strip()
            else:
                payload = groq_request("chat/completions", body)
            usage = payload.get("usage", {})
            return payload["choices"][0]["message"], {
                "seconds": round(time.perf_counter() - started, 2), "model": body["model"],
                "tokens_in": usage.get("prompt_tokens"), "tokens_out": usage.get("completion_tokens"),
            }
        except urllib.error.HTTPError as error:
            detail = error.read().decode(errors="replace")[:300]
            if error.code in (500, 502, 503, 504):
                cool_down(body["model"], 30)
                print(f"  · {body['model']} unavailable ({error.code}), switching model")
                continue
            if error.code == 429:
                daily = "per day" in detail or "PerDay" in detail
                said = re.search(r"try again in ([\d.]+)s", detail) or re.search(r'"retryDelay":\s*"(\d+)s"', detail)
                pause = float("inf") if daily else float(error.headers.get("retry-after") or (said and said.group(1)) or 5) + 0.5
                cool_down(body["model"], pause)
                print(f"  · {body['model']} {'daily limit reached, dropped' if daily else f'rate limited for {pause:.0f}s'}, switching model")
                continue
            # A malformed tool call from the model (Groq tool_use_failed, or "Tool call validation failed"):
            # the same model often repeats it, so rest it briefly and let the next one answer.
            if error.code == 400 and ("tool_use_failed" in detail or "tool call validation failed" in detail.lower()) and attempt <= 3:
                if len(POOL) > 1 or wanted not in POOL:
                    cool_down(body["model"], 15)
                    print(f"  · {body['model']} produced an invalid tool call, switching model")
                continue
            if "model_not_found" in detail or error.code == 404:
                raise SystemExit(f"No model {body['model']!r} for this key. See the list with: python3 agent/mvp.py --models")
            raise SystemExit(f"Model error {error.code}: {detail}")
        except (TimeoutError, urllib.error.URLError) as error:
            # No answer in time (overloaded model) or a network hiccup: rest this model, try another.
            cool_down(body["model"], 60)
            print(f"  · {body['model']} did not answer ({type(error).__name__}), switching model")
    raise SystemExit("The models kept refusing the request.")


# ---------------------------------------------------------------- loop

def run(reference, interactive=True):
    case = Case(reference)
    pick_model()
    messages = [
        {"role": "system", "content": SYSTEM.format(now=case.snapshot_at, ref=reference)},
        {"role": "user", "content": f"Handle {reference}. Bring me one clear decision."},
    ]
    trace = {"order": reference, "model": MODEL, "started_at": datetime.now(timezone.utc).isoformat(), "steps": []}
    proposal = None
    run_started = time.perf_counter()
    print(f"\n{reference} · {case.vehicle['make']} {case.vehicle['model']} · model {MODEL}\n")

    for step in range(1, MAX_STEPS + 1):
        reply, stats = chat(messages, SCHEMAS)
        trace["steps"].append({"step": step, "kind": "llm", **stats})
        messages.append({k: v for k, v in reply.items() if k in ("role", "content", "tool_calls")})
        calls = reply.get("tool_calls") or []
        if not calls:
            messages.append({"role": "user", "content": "Finish by calling propose_decision."})
            continue
        for call in calls:
            name = call["function"]["name"]
            try:
                args = json.loads(call["function"].get("arguments") or "{}")
            except json.JSONDecodeError:
                args = {}
            started = time.perf_counter()
            done = {s["tool"] for s in trace["steps"] if s["kind"] == "tool" and "error" not in s["result"]}
            missing = [tool for tool in REQUIRED_BEFORE_PROPOSAL if tool not in done]
            if name == "propose_decision" and missing:
                # Enforced here, not only in the prompt: no half-researched case reaches a person.
                result = {"error": f"Not yet. Do this cheap work first: {', '.join(missing)}. Then propose again."}
            elif name == "propose_decision":
                proposal = args
                result = {"status": "handed to a person"}
            elif name in TOOLS:
                result = TOOLS[name](case, args)
            else:
                result = {"error": f"unknown tool {name}"}
            seconds = round(time.perf_counter() - started, 2)
            trace["steps"].append({"step": step, "kind": "tool", "tool": name, "args": args, "seconds": seconds, "result": result})
            print(f"  {step:>2}. {name:<20} {seconds:>5.2f}s  {short(name, args, result)}")
            messages.append({"role": "tool", "tool_call_id": call["id"], "content": json.dumps(result, ensure_ascii=False)})
        if proposal:
            break

    agent_seconds = round(time.perf_counter() - run_started, 1)
    trace["proposal"] = proposal
    if not proposal:
        print("\nThe agent stopped without a proposal. A person should take the case.")

    decision, human_seconds = None, 0.0
    if proposal:
        show(proposal)
        if interactive:
            asked = time.perf_counter()
            decision = decide()
            human_seconds = round(time.perf_counter() - asked, 1)
    trace["decision"] = decision
    trace["timing"] = timing(trace, agent_seconds, human_seconds)
    report(trace["timing"])

    TRACES.mkdir(exist_ok=True)
    path = TRACES / f"{reference}-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    path.write_text(json.dumps(trace, indent=2, ensure_ascii=False))
    print(f"\nTrace: {path}")


def short(name, args, result):
    if "error" in result:
        return f'refused: {result["error"]}'
    if name == "ask_driver":
        return f'Q: {args.get("question", "")[:60]}\n{"":>31}A: {result.get("driver_reply", "")[:90]}'
    if name == "propose_decision":
        return "handed to a person"
    return ""


def show(proposal):
    print("\n" + "─" * 70)
    print(f"DECISION NEEDED  {proposal.get('headline', '')}\n")
    for fact in proposal.get("facts", []):
        print(f"  • {fact.get('fact')}  [{fact.get('source')}]")
    print(f"\n  Recommendation: {proposal.get('recommendation')}")
    print(f"  Delivery: {proposal.get('delivery_impact')}")
    for change in proposal.get("needs_approval", []):
        print(f"  Needs your yes: {change}")
    print("─" * 70)


def decide():
    while True:
        answer = input("\n[a]ccept · [c]hange · [r]eject ? ").strip().lower()[:1]
        if answer == "a":
            print("Accepted. Simulated: nothing real is sent or booked; the changes above would now run.")
            return {"choice": "accept"}
        if answer == "c":
            note = input("What should happen instead? ")
            print("Recorded. The agent would replan with your instruction.")
            return {"choice": "change", "note": note}
        if answer == "r":
            note = input("Why? ")
            print("Rejected. The case stays with a person; history is kept.")
            return {"choice": "reject", "note": note}


def timing(trace, agent_seconds, human_seconds):
    llm = sum(s["seconds"] for s in trace["steps"] if s["kind"] == "llm")
    tools = [s for s in trace["steps"] if s["kind"] == "tool"]
    manual = sum(MANUAL_MINUTES.get(s["tool"], 0) for s in tools if "error" not in s["result"])
    return {
        "agent_seconds": agent_seconds,
        "llm_seconds": round(llm, 1),
        "tool_seconds": round(sum(s["seconds"] for s in tools), 1),
        "llm_calls": sum(1 for s in trace["steps"] if s["kind"] == "llm"),
        "tool_calls": len(tools),
        "human_decision_seconds": human_seconds,
        "manual_minutes_estimate": manual,
        "saved_minutes_estimate": round(manual - human_seconds / 60, 1),
        "assumptions": "manual minutes per action from MANUAL_MINUTES in agent/mvp.py",
    }


def report(t):
    print(f"\nTime  agent {t['agent_seconds']}s (model {t['llm_seconds']}s over {t['llm_calls']} calls, tools {t['tool_seconds']}s)"
          f" · person {t['human_decision_seconds']}s")
    print(f"      by hand ≈ {t['manual_minutes_estimate']} min → saved ≈ {t['saved_minutes_estimate']} min (estimate)")


if __name__ == "__main__":
    if "--models" in sys.argv:
        print("\n".join(available_models()))
        raise SystemExit
    positional = [a for a in sys.argv[1:] if not a.startswith("--")]
    run(positional[0] if positional else "CD-420322", interactive="--auto" not in sys.argv)
