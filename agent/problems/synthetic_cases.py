"""Invented test cases built from situation templates, the same number per problem type.

Each template is one kind of problem. Its variants change the surface (cities,
cars, people, dates, local times, ferries) and, on purpose, the values that
decide the right answer: an amount under or over a policy limit, a delay that
fits the delivery window or not, a site that answers or not. So one problem
type can end with the agent finishing alone in one case and a person deciding
in another, which is what a test of the agent has to check.

Nothing comes from Bahn's packet. Names and companies are fictional; cities,
time zones, roads and ferry routes are real. Deterministic: the same command
always writes the same file.

    python3 agent/problems/synthetic_cases.py                # 50 cases per problem type
    python3 agent/problems/synthetic_cases.py --per-type 100
"""

import json
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import test_cases  # noqa: E402  record() and the shared policies
import validate  # noqa: E402

OUT = HERE / "data" / "test_cases_synthetic.jsonl"
POLICY = dict(test_cases.POLICY, parking="Driver policy: parking is reimbursed up to EUR 25 per job with a receipt; above that a person decides.",
              licence="Driver rule: a driver's licence must be valid until the end of the job.",
              winter="Legal rule: in Finland, winter tyres are mandatory from December to February; in Sweden from December to March in winter conditions.")

CITIES = {
    "DE": ("Europe/Berlin", ["Hamburg", "Berlin", "Munich", "Cologne", "Frankfurt", "Stuttgart", "Düsseldorf", "Hanover", "Bremen",
                             "Leipzig", "Dortmund", "Nuremberg", "Kiel", "Rostock", "Lübeck", "Dresden", "Kassel", "Münster"]),
    "DK": ("Europe/Copenhagen", ["Copenhagen", "Aarhus", "Odense", "Aalborg", "Esbjerg", "Kolding", "Vejle", "Roskilde", "Herning", "Randers"]),
    "SE": ("Europe/Stockholm", ["Stockholm", "Gothenburg", "Malmö", "Uppsala", "Linköping", "Örebro", "Helsingborg", "Jönköping"]),
    "FI": ("Europe/Helsinki", ["Helsinki", "Espoo", "Vantaa", "Tampere", "Turku", "Oulu", "Jyväskylä", "Lahti", "Kuopio", "Pori", "Vaasa", "Joensuu"]),
    "EE": ("Europe/Tallinn", ["Tallinn", "Tartu", "Pärnu"]),
}
FERRIES = {("DE", "FI"): "Travemünde–Helsinki", ("SE", "FI"): "Stockholm–Turku", ("EE", "FI"): "Tallinn–Helsinki",
           ("DE", "SE"): "Rostock–Trelleborg", ("DK", "FI"): "Travemünde–Helsinki via Germany"}
VEHICLES = [("Volvo XC60", False), ("Volvo V90", False), ("Volkswagen Golf", False), ("Volkswagen ID.4", True), ("Skoda Octavia", False),
            ("Skoda Enyaq", True), ("Toyota RAV4 Hybrid", False), ("Toyota Corolla Touring", False), ("BMW 320d", False), ("BMW i4", True),
            ("BMW X3", False), ("Audi A4 Avant", False), ("Audi Q4 e-tron", True), ("Audi A6", False), ("Mercedes-Benz C-Class", False),
            ("Mercedes-Benz EQA", True), ("Mercedes-Benz GLC", False), ("Ford Kuga", False), ("Kia EV6", True), ("Kia Sportage", False),
            ("Hyundai Ioniq 5", True), ("Hyundai Tucson", False), ("Tesla Model 3", True), ("Tesla Model Y", True), ("Polestar 2", True),
            ("Peugeot 3008", False), ("Renault Megane E-Tech", True), ("Mazda CX-5", False), ("Nissan Leaf", True), ("Lexus NX", False),
            ("Porsche Macan", False), ("Porsche Taycan", True), ("Cupra Born", True), ("Seat Leon", False), ("Opel Astra", False)]
FIRST = ["Aino", "Mikko", "Sanna", "Jonas", "Lena", "Ilkka", "Maren", "Pekka", "Helmi", "Oskar", "Freja", "Emil", "Riikka", "Tobias",
         "Ida", "Juho", "Klara", "Rasmus", "Tuuli", "Henrik", "Noora", "Matti", "Elin", "Lukas", "Saara", "Anders", "Kaisa", "Niklas"]
LAST = ["Virtanen", "Lund", "Hautala", "Brandt", "Kivelä", "Søgaard", "Nyström", "Reikko", "Vehl", "Aaltonen", "Holm", "Kaski",
        "Berger", "Lindqvist", "Mäkelä", "Krogh", "Salonen", "Wendt", "Rask", "Ekberg", "Paavola", "Thorsen", "Ojala", "Falk"]
ROOTS = ["Norr", "Kaari", "Fjord", "Lumi", "Havn", "Saari", "Elbe", "Kivi", "Strand", "Revon", "Ask", "Tähti", "Rhein", "Borg", "Mets",
         "Bal", "Vind", "Kotka", "Sund", "Aalto"]
SUFFIX = {"DE": ["Autohaus GmbH", "Fahrzeughandel GmbH", "Mobil GmbH"], "DK": ["Biler ApS", "Bilcenter A/S", "Auto ApS"],
          "SE": ["Bil AB", "Bilhall AB", "Motor AB"], "FI": ["Auto Oy", "Autotalo Oy", "Autokeskus Oy"], "EE": ["Auto OÜ", "Motors OÜ"]}


class Variant:
    """Random but reproducible surface for one case."""

    def __init__(self, index):
        self.index = index
        self.rng = random.Random(1000 + index)
        r = self.rng
        start = datetime(2026, 11, 2, tzinfo=timezone.utc) + timedelta(days=r.randrange(0, 145), hours=r.randrange(8, 14), minutes=r.choice([0, 10, 20, 30, 40, 50]))
        self.now = start
        countries = list(CITIES)
        self.from_country = r.choice(["DE", "DE", "DE", "SE", "DK", "EE"])
        self.to_country = r.choice([c for c in countries if c != self.from_country] + ["FI", "FI"])
        if self.to_country == self.from_country:
            self.to_country = "FI"
        self.from_zone, cities = CITIES[self.from_country]
        self.from_city = r.choice(cities)
        self.to_zone, cities = CITIES[self.to_country]
        self.to_city = r.choice(cities)
        self.ferry = FERRIES.get((self.from_country, self.to_country))
        self.vehicle_name, self.ev = r.choice(VEHICLES)
        self.year = r.randrange(2018, 2025)
        self.driver = self.person()
        self.other_driver = self.person()
        self.customer = self.company(self.to_country)
        self.seller = self.company(self.from_country)
        self.ref = f"T-{30000 + index}"

    def person(self):
        return f"{self.rng.choice(FIRST)} {self.rng.choice(LAST)}"

    def company(self, country):
        return f"{self.rng.choice(ROOTS)}{self.rng.choice(['', 'en', 'ia', 'by'])} {self.rng.choice(SUFFIX[country])} (fictional)"

    def pick(self, *options):
        return self.rng.choice(options)

    def chance(self, p=0.5):
        return self.rng.random() < p

    # ---- time
    def iso(self, dt):
        return dt.strftime("%Y-%m-%dT%H:%M:%SZ")

    def local(self, dt, zone):
        return dt.astimezone(ZoneInfo(zone)).strftime("%a %d %b %H:%M")

    def clock(self, dt, zone):
        return dt.astimezone(ZoneInfo(zone)).strftime("%H:%M")

    def window(self, start, hours, zone):
        end = start + timedelta(hours=hours)
        return f"{self.local(start, zone)}–{self.clock(end, zone)} {zone}"

    def later(self, hours=0, minutes=0):
        return self.now + timedelta(hours=hours, minutes=minutes)

    def msg(self, minutes_ago, sender, recipient, channel, text):
        return {"at": self.iso(self.now - timedelta(minutes=minutes_ago)), "from": sender, "to": recipient, "channel": channel, "text": text}

    # ---- order
    def order(self, pickup=None, delivery=None, driver=True):
        return {"reference": self.ref, "vehicle": f"{self.vehicle_name} {self.year}", "from": f"{self.from_city}, {self.from_country}",
                "to": f"{self.to_city}, {self.to_country}", "customer": self.customer, "driver": self.driver if driver else None,
                "pickup_local": pickup, "delivery_local": delivery}

    def business_start(self, start_in_hours, hours, zone):
        """Window start on local business hours: 08:00 at the earliest, ending by 18:00 local.
        A negative offset means the driver is already there, so the window is kept as it is."""
        start = self.later(start_in_hours).astimezone(ZoneInfo(zone)).replace(minute=0, second=0)
        if start_in_hours >= 0:
            latest = 18 - hours
            if start.hour < 8:
                start = start.replace(hour=8)
            elif start.hour > latest:
                start = (start + timedelta(days=1)).replace(hour=8)
        return start.astimezone(timezone.utc)

    def delivery_window(self, start_in_hours, hours=4):
        start = self.business_start(start_in_hours, hours, self.to_zone)
        return start, self.window(start, hours, self.to_zone), start + timedelta(hours=hours)

    def pickup_window(self, start_in_hours, hours=3):
        start = self.business_start(start_in_hours, hours, self.from_zone)
        return start, self.window(start, hours, self.from_zone), start + timedelta(hours=hours)


TEMPLATES = []


def template(func):
    TEMPLATES.append(func)
    return func


def case(v, code, domain, phase, severity, summary, order, facts, messages, driver, site, solution, handoff, must, must_not):
    return dict(code=code, domain=domain, phase=phase, severity=severity, summary=summary, now=v.iso(v.now), order=order,
                facts=facts, messages=messages, driver=driver, site=site, solution=solution, handoff=handoff, must=must, must_not=must_not)


NO_CUSTOMER = "contact the customer"
NO_ESCALATE = "escalate to a person"

# ================================================================== on the road


@template
def road_delay(v):
    delay = v.pick(1, 1.5, 2, 3)
    start, window, end = v.delivery_window(v.pick(3, 4, 5, 6))
    eta = end + timedelta(minutes=v.pick(-150, -90, -45, -20, 25, 50, 95, 140))
    fits = eta <= end
    cause = v.pick("a lorry fire", "an accident", "roadworks", "a closed bridge", "black ice")
    return case(
        v, "ROAD_CLOSURE_DELAY", "on_the_road", "in_transit", "low" if fits else "medium",
        f"A road closure after {cause} adds about {delay} h; the new ETA is {'inside' if fits else 'after'} the delivery window.",
        v.order(delivery=window),
        [(f"Traffic service: closure after {cause}, detour adds about {delay} h.", "traffic feed"),
         (f"New navigation ETA {v.local(eta, v.to_zone)} {v.to_zone}.", "driver app")],
        [v.msg(4, "driver", "operator", "driver_app", f"Road closed because of {cause}, I'm on a detour. Navigation says {v.clock(eta, v.to_zone)}.")],
        "You are on the detour, fine and rested.", None,
        (f"The new ETA {v.clock(eta, v.to_zone)} is inside the window {window}: record it internally and keep watching; no customer message."
         if fits else
         f"The new ETA {v.clock(eta, v.to_zone)} is after the window {window}. Prepare a revised estimate with the cause. "
         "[person only] Telling the customer. [approval] Any change to the delivery promise."),
        "agent_alone" if fits else "person_decides",
        ["compare the new ETA with the delivery window in local time"] + ([] if fits else ["hand the late delivery to a person"]),
        [NO_CUSTOMER, "change the delivery promise"] + ([NO_ESCALATE] if fits else []),
    )


@template
def charging_cost(v):
    v.vehicle_name, v.ev = v.pick(*[x for x in VEHICLES if x[1]])
    cost = v.pick(22, 31, 38, 46, 55, 64, 72, 86, 95, 110)
    within = cost <= 80
    return case(
        v, "EV_CHARGING_CARD_REJECTED", "on_the_road", "in_transit", "medium",
        f"The charging card is declined; a full charge paid by the driver would cost about EUR {cost}.",
        v.order(delivery=v.delivery_window(v.pick(8, 20, 26))[1]),
        [(POLICY["charging"], "driver policy"), (f"Battery at {v.pick(9, 12, 15, 18, 22)}%.", "driver message")],
        [v.msg(3, "driver", "operator", "driver_app", f"The company charging card is declined. The charger takes bank cards, about {cost} euros for a full charge.")],
        f"You are safe at the charger. You can pay about EUR {cost} with your own card.", None,
        (f"EUR {cost} is within the EUR 80 policy: tell the driver to pay, keep the receipt and claim it. Report the failing card internally."
         if within else
         f"EUR {cost} is above the EUR 80 policy limit. Suggest charging only enough to reach the next stop if possible, and ask a person "
         "to approve the rest. [approval] Cost above the limit. Report the failing card internally."),
        "agent_alone" if within else "person_decides",
        ["apply the EUR 80 charging limit", "tell the driver to keep the receipt"],
        [NO_CUSTOMER] + ([NO_ESCALATE] if within else ["approve a cost above the policy limit"]),
    )


@template
def puncture(v):
    spare = v.chance(0.4)
    start, window, end = v.delivery_window(v.pick(6, 8, 24))
    road = v.pick("A1", "A7", "E4", "E20", "E45", "A24", "E18")
    return case(
        v, "TYRE_PUNCTURE", "on_the_road", "in_transit", "high",
        f"Puncture on the {road}; the car has {'a spare wheel' if spare else 'only a sealant kit'}.",
        v.order(delivery=window),
        [(f"Car equipment: {'space-saver spare wheel and jack' if spare else 'tyre sealant kit, no spare wheel'}.", "vehicle record"),
         (f"Next service area {v.pick(3, 5, 8, 12)} km ahead.", "route map")],
        [v.msg(6, "driver", "operator", "driver_app", f"Tyre warning, rear {v.pick('left', 'right')} is flat. I stopped on the hard shoulder of the {road}.")],
        f"You are behind the barrier with a vest. {'You know how to change a wheel and the spare is fine.' if spare else 'The tyre has a cut near the sidewall.'}",
        None,
        ("Check the driver is safe, then let them limp to the service area and fit the space-saver there, not on the hard shoulder. "
         "Space-savers are limited to 80 km/h: recompute the ETA against the window."
         if spare else
         "Check the driver is safe and where exactly. A sidewall cut cannot be sealed: do not drive on it. Look up mobile tyre service or "
         "roadside help. [approval] Booking and cost. [person only] Customer message if delivery slips."),
        "agent_alone" if spare else "person_decides",
        ["ask whether the driver is safe before anything else"] + (["recompute the ETA at 80 km/h"] if spare else ["look up roadside help", "ask a person to approve the booking"]),
        [NO_CUSTOMER] + (["tell the driver to change the wheel on the hard shoulder"] if spare else ["tell the driver to drive on a cut tyre", "book without approval"]),
    )


@template
def warning_light(v):
    red = v.chance(0.5)
    light = v.pick("engine management", "oil pressure", "brake system", "coolant temperature") if red else v.pick("tyre pressure", "washer fluid", "service due", "AdBlue level")
    return case(
        v, "DASHBOARD_WARNING", "on_the_road", "in_transit", "critical" if red else "low",
        f"A {'red' if red else 'yellow'} {light} warning comes on during the drive.",
        v.order(delivery=v.delivery_window(v.pick(5, 9, 22))[1]),
        [(POLICY["warning"], "safety rule")],
        [v.msg(5, "driver", "operator", "driver_app", f"A {light} warning light came on. It's {'red' if red else 'yellow'}.")],
        f"You stopped at a service area, safe. {'The car felt different before the light came on.' if red else 'The car drives normally.'} You can send a photo.",
        None,
        (f"A red {light} warning: the car must not be driven again. Confirm the driver is safe and stopped, ask for a photo of the dashboard "
         "and the exact location. [person only] Get the owner's decision on recovery. [approval] Any towing or workshop booking."
         if red else
         f"A yellow {light} warning is not a stop signal. Ask for a photo to confirm, then let the driver deal with it at the service area "
         "(top up or check pressure) and continue."),
        "person_decides" if red else "agent_alone",
        ["ask for a photo of the dashboard"] + (["tell the driver not to drive on", "hand the recovery decision to a person"] if red else []),
        [NO_CUSTOMER] + (["authorise the driver to continue"] if red else [NO_ESCALATE]),
    )


@template
def collision(v):
    hurt = v.chance(0.15)
    return case(
        v, "MINOR_COLLISION", "on_the_road", "in_transit", "critical" if hurt else "high",
        f"The car was hit {v.pick('in a car park', 'at a junction', 'in slow traffic')}; {'the driver has neck pain' if hurt else 'nobody is hurt'}.",
        v.order(delivery=v.delivery_window(v.pick(6, 20))[1]),
        [("The other party gave their insurance details.", "driver message")],
        [v.msg(9, "driver", "operator", "driver_app", "Another car hit us. Dent on the side. The other driver gave me their insurance details.")],
        f"{'Your neck hurts a little; you have not seen a doctor.' if hurt else 'You are unhurt.'} You photographed the damage and the other car.",
        None,
        ("Health first: ask about injuries"
         + ("; advise seeing a doctor and not driving. " if hurt else ". ")
         + "Collect photos, the other party's details, place and time. Check the car is safe to drive. [person only] Inform the customer. "
         "[approval] Any change to the delivery promise."),
        "person_decides",
        ["ask whether anyone is hurt", "collect photos and the other party's details", "leave the customer message to a person"],
        [NO_CUSTOMER, "admit liability", "promise a repair"],
    )


@template
def driver_unwell(v):
    return case(
        v, "DRIVER_UNWELL_EN_ROUTE", "on_the_road", "in_transit", "critical",
        "The driver feels unwell and has stopped; the car is parked safely.",
        v.order(delivery=v.delivery_window(v.pick(20, 30, 44))[1]),
        [("The car is in a guarded hotel car park.", "driver message")] + ([(f"Ferry {v.ferry} booked.", "travel booking")] if v.ferry else []),
        [v.msg(7, "driver", "operator", "driver_app", f"I feel {v.pick('dizzy', 'feverish', 'very sick')}. I stopped at a hotel. I can't drive now.")],
        "You are not in danger and do not need an ambulance, but you cannot drive for at least a day. Keys are with you.", None,
        "Ask whether the driver needs medical help and tell them not to drive. Confirm where the car and keys are. Prepare replacement "
        "driver options" + (" and the ferry change" if v.ferry else "") + ". [approval] Replacement and costs. [person only] Customer message.",
        "person_decides",
        ["ask whether the driver needs medical help", "tell the driver not to drive", "prepare replacement options"],
        [NO_CUSTOMER, "pressure the driver to continue"],
    )


@template
def tracking_gap(v):
    answers = v.chance(0.6)
    start, window, end = v.delivery_window(v.pick(5, 8, 12))
    gap = v.pick(90, 120, 150, 180, 240)
    return case(
        v, "TRACKING_GAP", "on_the_road", "in_transit", "medium",
        f"No position from the driver app for {gap} minutes.",
        v.order(delivery=window),
        [(f"Last app position {gap} minutes ago, {v.pick(120, 210, 340)} km from destination.", "tracking")],
        [],
        ("Your phone app crashed. You are driving normally and expect to arrive on time. You restart the app when asked."
         if answers else None),
        None,
        ("Ask the driver for a position and ETA; they answer and restart the app. Record the reply as the driver's statement and keep watching."
         if answers else
         "Ask the driver; no answer. Try again by SMS and call. A gap is not proof of a problem, but with no answer before the window, "
         "hand it to a person with the last known position and times."),
        "agent_alone" if answers else "person_decides",
        ["ask the driver before raising anything", "treat the gap as a reason to ask, not a diagnosis"],
        [NO_CUSTOMER, "tell the customer the car is late"] + ([NO_ESCALATE] if answers else []),
    )


@template
def winter_tyres(v):
    v.to_country, (v.to_zone, cities) = "FI", CITIES["FI"]
    v.to_city = v.rng.choice(cities)
    winter_month = v.now.month in (12, 1, 2)
    summer_tyres = v.chance(0.5)
    blocked = winter_month and summer_tyres
    return case(
        v, "WINTER_TYRE_REQUIREMENT", "on_the_road", "before_pickup", "high" if blocked else "low",
        f"The car is on {'summer' if summer_tyres else 'winter'} tyres and goes to Finland in {v.now.strftime('%B')}.",
        v.order(pickup=v.pickup_window(v.pick(20, 26))[1]),
        [(POLICY["winter"], "legal rule"), (f"Seller: car has {'summer' if summer_tyres else 'winter'} tyres fitted.", "site message")],
        [],
        None,
        "We can fit winter tyres for EUR 240 tomorrow morning if someone pays." if summer_tyres else "Winter tyres are fitted.",
        ("Winter tyres are mandatory in Finland this month and the car has summer tyres: it cannot be delivered as is. Ask the site about "
         "fitting winter tyres (EUR 240). [approval] Cost and delay. [person only] Agree with the customer."
         if blocked else
         "The tyres are legal for the trip " + ("(winter tyres fitted)." if not summer_tyres else "(outside the winter tyre period).") + " No action needed."),
        "person_decides" if blocked else "agent_alone",
        ["check the tyre rule for the month and country"],
        [NO_CUSTOMER] + (["send the car on summer tyres"] if blocked else [NO_ESCALATE]),
    )


@template
def police_check(v):
    complete = v.chance(0.6)
    return case(
        v, "ROADSIDE_POLICE_CHECK", "on_the_road", "in_transit", "medium",
        f"Police stop the driver and ask for the car's papers; {'everything is in the car' if complete else 'the registration certificate is missing'}.",
        v.order(delivery=v.delivery_window(v.pick(6, 20))[1]),
        [("Order documents: registration certificate part I, transfer note, CMR.", "order")],
        [v.msg(2, "driver", "operator", "driver_app", "Police check. They want the car papers.")],
        ("All papers are in the glovebox." if complete else "The registration certificate is not in the car. The police say you may not continue without it."),
        "We can email a scan of the registration certificate now." if not complete else None,
        ("Tell the driver where the papers are (glovebox folder) and to show them with the CMR. Nothing else to do."
         if complete else
         "Ask the pickup site for a scan of the registration certificate and send it to the driver at once. If the police still refuse, "
         "hand over with the facts. [approval] Any extra cost or delay."),
        "agent_alone" if complete else "person_decides",
        ["tell the driver which papers to show"],
        [NO_CUSTOMER, "tell the driver to leave without police agreement"] + ([NO_ESCALATE] if complete else []),
    )


# ================================================================== driver travel


@template
def missed_train(v):
    flexible = v.chance(0.6)
    p_start, window, p_end = v.pickup_window(v.pick(4, 5, 6))
    arrival = p_start + timedelta(minutes=v.pick(-40, 20, 70, 120, 170, 210))
    fits = arrival + timedelta(minutes=25) <= p_end
    ok = flexible and fits
    return case(
        v, "MISSED_TRAIN_CONNECTION", "driver_travel", "before_pickup", "low" if ok else "medium",
        f"The driver missed a train connection on the way to pickup; {'flexible' if flexible else 'fixed'} ticket.",
        v.order(pickup=window),
        [(f"Ticket: {'flexible fare valid on any train that day' if flexible else 'saver fare bound to the booked train; a new ticket costs about EUR 49'}.", "travel booking"),
         (f"Next train arrives {v.local(arrival, v.from_zone)}; taxi to the seller about 25 minutes.", "timetable")],
        [v.msg(3, "driver", "operator", "driver_app", "I missed my connection. Next train is later.")],
        "You are at the station and can take the next train.", None,
        ("The flexible ticket covers the next train and arrival fits the pickup slot: tell the driver to take it."
         if ok else
         ("A new ticket is needed (about EUR 49). " if not flexible else "") + ("The arrival misses the pickup slot; ask the site if a later handover is possible. " if not fits else "")
         + "[approval] Any purchase or slot change."),
        "agent_alone" if ok else "person_decides",
        ["check the ticket conditions", "compare the arrival with the pickup slot"],
        [NO_CUSTOMER, "buy a ticket without approval"] + ([NO_ESCALATE] if ok else []),
    )


@template
def ferry_missed(v):
    v.from_country, (v.from_zone, cities) = "DE", CITIES["DE"]
    v.from_city = v.rng.choice(cities)
    v.to_country, (v.to_zone, cities) = "FI", CITIES["FI"]
    v.to_city, v.ferry = v.rng.choice(cities), FERRIES[("DE", "FI")]
    flexible = v.chance(0.35)
    start, window, end = v.delivery_window(v.pick(30, 36, 40))
    return case(
        v, "FERRY_CHECKIN_MISSED", "driver_travel", "in_transit", "low" if flexible else "high",
        "The driver reached the ferry terminal after check-in closed.",
        v.order(delivery=window),
        [(f"Booked sailing {v.ferry}; {'flex ticket, free change to the next sailing' if flexible else 'change fee EUR 90 for the next sailing (quote, not booked)'}.", "travel booking"),
         (f"Next sailing arrives in time for {'the window' if flexible else 'delivery only the day after the window'}.", "ferry timetable")],
        [v.msg(6, "driver", "operator", "driver_app", "I got to Travemünde too late, check-in is closed.")],
        "You are at the terminal, safe, and can wait for the next sailing.", None,
        ("The flex ticket moves free to the next sailing, which still meets the window: tell the driver to check in for it."
         if flexible else
         "Treat the quote as a quote. Work out the new delivery estimate. [approval] Rebooking and EUR 90 fee. [person only] Customer message."),
        "agent_alone" if flexible else "person_decides",
        ["read the ticket conditions", "check the next sailing against the window"],
        [NO_CUSTOMER] + ([NO_ESCALATE] if flexible else ["rebook without approval"]),
    )


@template
def flight_cancelled(v):
    rebooked_ok = v.chance(0.4)
    p_start, window, p_end = v.pickup_window(v.pick(15, 16, 17))
    return case(
        v, "POSITIONING_FLIGHT_CANCELLED", "driver_travel", "before_pickup", "medium" if rebooked_ok else "high",
        "The driver's flight to the pickup city was cancelled.",
        v.order(pickup=window),
        [("Airline cancelled the evening flight.", "airline notice"),
         (("Airline automatically rebooked the driver on the first morning flight, arriving 2 h before the pickup slot."
           if rebooked_ok else "Airline offers only a refund; the first other flight with seats costs EUR 260 and lands after the slot opens."),
          "airline notice")],
        [v.msg(10, "driver", "operator", "driver_app", "My flight is cancelled!")],
        "You are at the airport and will follow instructions.", "We can hand over until 17:00 if told in advance.",
        ("The airline's automatic rebooking still reaches the pickup in time at no cost: confirm it with the driver."
         if rebooked_ok else
         "Ask the pickup site about a later handover. Prepare the flight option. [approval] Buying the EUR 260 flight."),
        "agent_alone" if rebooked_ok else "person_decides",
        ["check the new arrival against the pickup slot"],
        [NO_CUSTOMER, "buy a ticket"] + ([NO_ESCALATE] if rebooked_ok else []),
    )


@template
def return_trip(v):
    mode = v.pick("train", "bus", "flight + train")
    return case(
        v, "RETURN_TRIP_QUESTION", "driver_travel", "after_delivery", "low",
        "After delivery the driver asks how to get home.",
        v.order(delivery=f"delivered {v.local(v.later(-1), v.to_zone)} {v.to_zone}"),
        [(f"Driver home base: {v.from_city}.", "driver profile"), (f"Best connection home: {mode}, about {v.pick(3, 5, 7, 9)} h.", "travel search"),
         (POLICY["tolls"], "driver policy")],
        [v.msg(4, "driver", "operator", "driver_app", f"Delivered. How do I get back to {v.from_city}?")],
        "You are at the dealer.", None,
        f"Give the {mode} connection home and remind the driver the return ticket is reimbursed with a receipt.",
        "agent_alone",
        ["give a concrete route home", "remind the driver to keep the receipt"],
        [NO_ESCALATE, "book a ticket"],
    )


@template
def hotel_needed(v):
    cost = v.pick(79, 95, 110, 135)
    return case(
        v, "OVERNIGHT_STAY_NEEDED", "driver_travel", "in_transit", "medium",
        f"The driver cannot reach the next connection tonight and needs a hotel (about EUR {cost}).",
        v.order(delivery=v.delivery_window(v.pick(20, 26))[1]),
        [("Last train of the day has left.", "timetable"), (f"Hotel near the station: EUR {cost}.", "hotel search, not booked")],
        [v.msg(5, "driver", "operator", "driver_app", "The last train is gone. Where do I sleep?")],
        "You are at the station, safe.", None,
        f"Confirm the driver is safe, find the nearest reasonable hotel (EUR {cost}) and the first connection tomorrow; check delivery still fits. [approval] The hotel cost.",
        "person_decides",
        ["find a hotel option and the first connection", "ask a person to approve the cost"],
        [NO_CUSTOMER, "book the hotel without approval"],
    )


@template
def rail_strike(v):
    return case(
        v, "RAIL_STRIKE_ANNOUNCED", "driver_travel", "before_pickup", "medium",
        "A rail strike is announced for the day the driver travels to pickup.",
        v.order(pickup=v.pickup_window(v.pick(30, 40, 50))[1]),
        [("National rail strike announced for the pickup day.", "news"), (f"Long-distance bus option: EUR {v.pick(25, 34, 42)}, arrives 1 h before the slot.", "travel search, not booked")],
        [],
        "You had planned the train. The bus is fine for you.", None,
        "Warn the driver now and prepare the bus option with times. [approval] Buying the bus ticket.",
        "person_decides",
        ["warn the driver early", "prepare an alternative"],
        [NO_CUSTOMER, "buy a ticket without approval"],
    )


# ================================================================== dispatch


@template
def offer_not_taken(v):
    days = v.pick(2, 3, 6, 8)
    fee, market = v.pick(380, 450, 520), v.pick(560, 610, 640)
    urgent = days <= 3
    return case(
        v, "OFFER_NOT_TAKEN", "dispatch", "before_pickup", "medium" if urgent else "low",
        f"An offer has no driver yet; pickup is in {days} days.",
        v.order(pickup=v.pickup_window(days * 24)[1], driver=False),
        [(f"Offer fee EUR {fee}, published 2 days ago.", "offer"), (f"Similar jobs this month taken at EUR {market}–{market + 40}.", "offer history")],
        [], None, None,
        (f"Pickup is close and the fee is below similar jobs. Propose raising it to about EUR {market} or a directed offer to nearby drivers. [approval] Price change."
         if urgent else
         f"Pickup is {days} days away; offers often fill late. Keep it published and check again in 24 h; prepare the price comparison in case."),
        "person_decides" if urgent else "agent_alone",
        ["compare the fee with similar jobs"],
        [NO_CUSTOMER, "change the fee without approval"] + ([] if urgent else [NO_ESCALATE]),
    )


@template
def driver_cancels(v):
    reason = v.pick("a family emergency", "illness", "a car accident on the way home", "a sick child")
    free = v.pick(1, 2, 3)
    return case(
        v, "DRIVER_CANCELS_BEFORE_PICKUP", "dispatch", "before_pickup", "high",
        f"The booked driver cancels because of {reason}.",
        v.order(pickup=v.pickup_window(v.pick(14, 20, 40))[1]),
        [(f"{free} other driver{'s are' if free > 1 else ' is'} near {v.from_city} free on the pickup day.", "driver availability")],
        [v.msg(8, "driver", "operator", "driver_app", f"I'm sorry, I have {reason}. I can't do the job.")],
        "You cannot do the job and appreciate understanding.", None,
        "Answer kindly and release the driver without pressure. List free drivers nearby and prepare a directed offer. [approval] Cancelling and reassigning.",
        "person_decides",
        ["answer the driver kindly", "find replacement candidates", "ask a person to approve the reassignment"],
        [NO_CUSTOMER, "pressure the driver", "reassign without approval"],
    )


@template
def schedule_conflict(v):
    overlap = v.chance(0.6)
    return case(
        v, "DRIVER_SCHEDULE_QUESTION", "dispatch", "before_pickup", "low",
        "A driver asks whether they can take another job.",
        v.order(pickup=v.pickup_window(v.pick(30, 48))[1]),
        [(f"The other job {'overlaps with' if overlap else 'starts a day after'} the end of this job.", "driver bookings")],
        [v.msg(5, "driver", "operator", "driver_app", "Can I also take the job on the day after?")],
        "You want a yes or no.", None,
        ("The jobs overlap: tell the driver no and why." if overlap else "No overlap: tell the driver they can apply for it in the app."),
        "agent_alone",
        ["check the driver's bookings"],
        [NO_ESCALATE, "book the job for the driver"],
    )


@template
def licence_expiry(v):
    return case(
        v, "DRIVER_LICENCE_EXPIRING", "dispatch", "before_pickup", "medium",
        "The booked driver's licence expires before the end of the job.",
        v.order(pickup=v.pickup_window(v.pick(48, 72))[1]),
        [(POLICY["licence"], "driver rule"), ("Licence on file expires the day before delivery.", "driver profile")],
        [], "You renewed your licence last week but did not upload it." if v.chance(0.5) else "You had not noticed.", None,
        "Ask the driver for the renewed licence. If none is uploaded before pickup, prepare a replacement. [approval] Reassignment.",
        "person_decides",
        ["ask the driver for a valid licence"],
        [NO_CUSTOMER, "let the job start with an expired licence"],
    )


@template
def job_already_taken(v):
    return case(
        v, "DRIVER_ASKS_TAKEN_JOB", "dispatch", "before_pickup", "low",
        "A driver asks to take a job that another driver accepted an hour ago.",
        v.order(pickup=v.pickup_window(v.pick(24, 48))[1]),
        [("The offer was accepted by another driver 1 h ago.", "offer")],
        [v.msg(3, "driver", "operator", "driver_app", "Is the job still free? I can do it.")],
        "You accept the answer.", None,
        "Tell the driver the job is taken and point to open jobs in the app.",
        "agent_alone", ["check the offer state"], [NO_ESCALATE, "reassign the job"],
    )


# ================================================================== pickup readiness


@template
def car_not_ready(v):
    wait = v.pick(30, 45, 90, 180, 300)
    small = wait <= 60
    return case(
        v, "CAR_NOT_READY_AT_PICKUP", "pickup_readiness", "before_pickup", "low" if small else "medium",
        f"The driver is at the seller; the car will be ready in about {wait} minutes.",
        v.order(pickup=v.pickup_window(-1)[1]),
        [(POLICY["waiting"], "driver policy"), ("The seller confirmed yesterday the car would be ready.", "site message")],
        [v.msg(4, "driver", "operator", "driver_app", "Car is not ready, they say it is still being cleaned.")],
        "You can wait.", f"The car is back in about {wait} minutes; keys and papers are ready.",
        (f"Confirm the {wait}-minute wait with the site; under 60 minutes there is no waiting pay: tell the driver to wait."
         if small else
         f"Confirm the real ready time with the site ({wait} minutes) and check the effect on the onward trip. [approval] Waiting pay and any travel change."),
        "agent_alone" if small else "person_decides",
        ["ask the site for the real ready time", "apply the waiting policy"],
        [NO_CUSTOMER] + ([NO_ESCALATE] if small else ["approve waiting pay"]),
    )


@template
def flat_battery(v):
    clean = v.chance(0.65)
    return case(
        v, "FLAT_12V_BATTERY_AT_PICKUP", "pickup_readiness", "before_pickup", "low" if clean else "medium",
        "The car does not start at pickup; the 12 V battery is flat.",
        v.order(pickup=v.pickup_window(-1)[1]),
        [], [v.msg(3, "driver", "operator", "driver_app", "Car won't start, dashboard is dead.")],
        ("After a jump start it runs normally, no warnings." if clean else "After a jump start a red battery warning stays on."),
        "We have a jump starter.",
        ("Ask the site for a jump start; no warning stays on, so drive on without stopping the engine for the first hour."
         if clean else
         "Ask the site for a jump start; a red battery warning stays on, so the car must not leave. [approval] Battery replacement or workshop. [person only] Customer."),
        "agent_alone" if clean else "person_decides",
        ["ask the site for a jump start", "ask about warning lights after the start"],
        [NO_CUSTOMER] + ([NO_ESCALATE] if clean else ["let the car leave with a red warning"]),
    )


@template
def no_plates(v):
    return case(
        v, "NO_PLATES_FOR_EXPORT", "pickup_readiness", "before_pickup", "high",
        "The car was deregistered and has no plates; it cannot be driven on public roads.",
        v.order(pickup=v.pickup_window(-1)[1]),
        [("A deregistered car needs export plates with insurance before driving.", "operations guide")],
        [v.msg(4, "driver", "operator", "driver_app", "The car has no plates.")],
        "You will not drive it without plates.", f"Export plates with insurance: EUR {v.pick(150, 180, 210)}, ready tomorrow morning.",
        "Tell the driver not to drive. Ask the site about export plates. [approval] Cost and new date. [person only] Customer agreement.",
        "person_decides", ["tell the driver not to drive without plates", "ask the site about export plates"],
        [NO_CUSTOMER, "suggest driving without plates"],
    )


@template
def second_key(v):
    return case(
        v, "SECOND_KEY_MISSING", "pickup_readiness", "before_pickup", "medium",
        "The order says two keys; the site hands over one.",
        v.order(pickup=v.pickup_window(-1)[1]),
        [("Order: 2 keys, service book, registration documents.", "order")],
        [v.msg(3, "driver", "operator", "driver_app", "Only one key. Do I take the car?")],
        "You can photograph what you received.", v.pick("The second key was lost before we bought the car.", "The second key is at our other branch."),
        "Ask the site where the second key is; get the shortage written on the handover paper and photos of what was received. [person only] Go or no-go with the customer.",
        "person_decides", ["ask the site about the second key", "get the shortage written down"],
        [NO_CUSTOMER, "decide alone to collect or refuse"],
    )


@template
def key_box(v):
    documented = v.chance(0.5)
    answers = documented or v.chance(0.6)
    return case(
        v, "AFTER_HOURS_KEY_COLLECTION", "pickup_readiness", "before_pickup", "low" if answers else "medium",
        "The driver will arrive after the site closes and asks how to get the keys.",
        v.order(pickup=v.pickup_window(2, 5)[1]),
        [(("Site profile: after closing, keys are in key box 2 at the gate; code sent by SMS on the day." if documented
           else "Site profile has no after-hours instruction."), "site profile")],
        [v.msg(4, "driver", "operator", "driver_app", "I'll arrive after they close. How do I get the key?")],
        "You arrive in about 2 hours.",
        ("Keys will be in the key box; we send the code by SMS." if answers else None),
        ("Answer from the site profile and point to the SMS code." if documented else
         "Ask the site; they confirm the key box and SMS code. Tell the driver." if answers else
         "Ask the site; no answer. The driver arrives in 2 hours with no way in: hand it to a person with what was tried."),
        "agent_alone" if answers else "person_decides",
        ["use the site profile or ask the site", "never invent a code"],
        [NO_CUSTOMER, "invent a code"] + ([NO_ESCALATE] if answers else []),
    )


@template
def site_holiday(v):
    open_ = v.chance(0.5)
    return case(
        v, "SITE_POSSIBLY_CLOSED_HOLIDAY", "pickup_readiness", "before_pickup", "low" if open_ else "medium",
        "The pickup day is a local public holiday; the site profile does not say whether they are open.",
        v.order(pickup=v.pickup_window(v.pick(30, 40))[1]),
        [("Pickup day is a public holiday in the region.", "calendar")],
        [], None, ("We are open as normal." if open_ else "We are closed that day; next possible handover is the following morning."),
        ("Ask the site; they are open. Keep the plan." if open_ else
         "Ask the site; they are closed. Prepare the next-day pickup and its effect on delivery. [approval] Slot change. [person only] Customer."),
        "agent_alone" if open_ else "person_decides",
        ["ask the site before the driver travels"],
        [NO_CUSTOMER] + ([NO_ESCALATE] if open_ else ["change the slot without approval"]),
    )


@template
def vin_mismatch(v):
    return case(
        v, "VIN_MISMATCH_AT_PICKUP", "pickup_readiness", "before_pickup", "high",
        "The VIN on the car does not match the VIN on the order.",
        v.order(pickup=v.pickup_window(-1)[1]),
        [("Order VIN ends in …4821; car VIN ends in …4812.", "driver photo")],
        [v.msg(3, "driver", "operator", "driver_app", "The VIN on the windscreen is different from the order.")],
        "You sent a photo of the VIN plate.", "This is the car we sold to your customer. Maybe the order has a typo.",
        "Ask the driver not to load the car yet. Ask the site to confirm identity with the registration document. A site statement does not "
        "change the order: [person only] confirm with the customer before collecting.",
        "person_decides", ["stop the collection until identity is confirmed", "ask the site for the registration document"],
        [NO_CUSTOMER, "collect the car before identity is confirmed", "correct the VIN on the order alone"],
    )


@template
def papers_missing(v):
    return case(
        v, "PAPERS_MISSING_AT_PICKUP", "pickup_readiness", "before_pickup", "high",
        "The registration certificate is not with the car at pickup.",
        v.order(pickup=v.pickup_window(-1)[1]),
        [("Export requires the original registration certificate with the car.", "operations guide")],
        [v.msg(3, "driver", "operator", "driver_app", "No registration papers in the car or at the desk.")],
        "You can wait an hour.", v.pick("The papers are with our accountant; we can have them in 2 hours.", "The papers were posted to the buyer."),
        "Ask the site where the papers are and when they can be at the car. [approval] Waiting or a new slot. [person only] Customer if papers went to them.",
        "person_decides", ["ask the site where the papers are"],
        [NO_CUSTOMER, "let the car leave without the papers"],
    )


# ================================================================== delivery handover


@template
def receiver_absent(v):
    other = v.chance(0.55)
    return case(
        v, "RECEIVER_NOT_AVAILABLE", "delivery_handover", "in_transit", "medium",
        "The driver arrives in time but the named receiver is not there.",
        v.order(delivery=v.delivery_window(-1)[1]),
        [(POLICY["keys"], "handover rule")],
        [v.msg(4, "driver", "operator", "driver_app", "The receiver isn't here. Nobody wants to sign.")],
        "You can wait up to an hour with the car and keys.",
        (f"{v.person()} from sales can receive and sign in 20 minutes." if other else "Nobody else can sign today."),
        ("Ask the site for another authorised receiver; one can sign in 20 minutes. Tell the driver to wait and hand over only to that named person."
         if other else
         "Ask the site; nobody can sign. Keep the car and keys with the driver. [approval] Overnight storage or second attempt. [person only] Customer."),
        "agent_alone" if other else "person_decides",
        ["ask the site for an authorised receiver", "keep the keys with the driver until a named person signs"],
        [NO_CUSTOMER, "tell the driver to leave the keys"] + ([NO_ESCALATE] if other else []),
    )


@template
def address_conflict(v):
    other_city = v.rng.choice([c for c in CITIES[v.to_country][1] if c != v.to_city])
    return case(
        v, "DELIVERY_ADDRESS_CONFLICT", "delivery_handover", "before_pickup", "high",
        f"The delivery address says {v.to_city}, the order note says {other_city}.",
        v.order(delivery=v.delivery_window(v.pick(30, 50))[1]),
        [(f"Delivery address: {v.to_city}.", "order"), (f"Customer note: 'Deliver to our {other_city} branch.'", "order note")],
        [], None, None,
        "Both instructions come from the customer and disagree; show both with their sources. [person only] Ask the customer which is right.",
        "person_only", ["show both instructions with their sources", "stop and hand over"],
        [NO_CUSTOMER, "choose an address"],
    )


@template
def damage_remark(v):
    pre_existing = v.chance(0.6)
    part = v.pick("front bumper", "rear door", "left mirror", "bonnet", "rear bumper")
    return case(
        v, "DAMAGE_REMARK_AT_HANDOVER", "delivery_handover", "in_transit", "low" if pre_existing else "high",
        f"The receiver points out a scratch on the {part}.",
        v.order(delivery=v.delivery_window(-1)[1]),
        [(f"Pickup photos {'show' if pre_existing else 'do not show'} a scratch on the {part}.", "pickup proof")],
        [v.msg(3, "driver", "operator", "driver_app", f"Receiver found a scratch on the {part} and wants to note it.")],
        "You can send a photo.", None,
        ("The scratch is on the pickup photos: let the receiver write the remark, add 'present at pickup', sign, attach both photo sets."
         if pre_existing else
         "The scratch is not on the pickup photos: let the receiver write the remark, collect photos, do not discuss fault. [person only] Claim handling with the customer."),
        "agent_alone" if pre_existing else "person_decides",
        ["compare with the pickup photos", "let the receiver write the remark"],
        [NO_CUSTOMER, "admit liability"] + ([NO_ESCALATE] if pre_existing else []),
    )


@template
def early_arrival(v):
    accepts = v.chance(0.6)
    return case(
        v, "EARLY_ARRIVAL", "delivery_handover", "in_transit", "low",
        "The driver will arrive about two hours before the delivery window.",
        v.order(delivery=v.delivery_window(v.pick(3, 4))[1]),
        [("Site opening hours 08:00–17:00.", "site profile")],
        [v.msg(4, "driver", "operator", "driver_app", "I'll be early. Can I deliver right away?")],
        "You can wait if needed.", ("Early is fine." if accepts else "Please come in the window; the receiver is out until then."),
        ("Ask the site; early is fine: tell the driver to deliver on arrival." if accepts else "Ask the site; they want the window: tell the driver to wait and deliver in the window."),
        "agent_alone", ["ask the delivery site before changing the time"], [NO_CUSTOMER, NO_ESCALATE],
    )


@template
def after_closing(v):
    stays = v.chance(0.5)
    return case(
        v, "ARRIVAL_AFTER_CLOSING", "delivery_handover", "in_transit", "medium",
        "The driver will reach the delivery site 40 minutes after it closes.",
        v.order(delivery=v.window(v.now.astimezone(ZoneInfo(v.to_zone)).replace(hour=13, minute=0).astimezone(timezone.utc), 4, v.to_zone)),
        [("Site closes at 17:00.", "site profile"), (POLICY["keys"], "handover rule")],
        [v.msg(5, "driver", "operator", "driver_app", "I'll be there at 17:40, they close at 17:00.")],
        "You can stay overnight nearby if needed.", ("Someone can wait until 18:00." if stays else "Nobody can stay; come tomorrow at 08:00."),
        ("Ask the site; someone waits until 18:00. Tell the driver." if stays else
         "Ask the site; nobody waits. The car and keys stay with the driver overnight. [approval] Hotel and next-morning delivery. [person only] Customer."),
        "agent_alone" if stays else "person_decides",
        ["ask the site whether someone can wait"],
        [NO_CUSTOMER, "tell the driver to leave the car and keys unattended"] + ([NO_ESCALATE] if stays else []),
    )


@template
def mailbox_keys(v):
    agreed = v.chance(0.4)
    return case(
        v, "KEYS_DROP_REQUEST", "delivery_handover", "in_transit", "medium",
        "The receiver asks the driver to leave the car outside and the keys in the mailbox.",
        v.order(delivery=v.delivery_window(-1)[1]),
        [(POLICY["keys"], "handover rule"), (("The customer agreed in writing to a key-drop delivery." if agreed else "No written key-drop agreement on the order."), "order")],
        [v.msg(3, "driver", "operator", "driver_app", "The receiver called: leave the keys in the mailbox. OK?")],
        "You will do what you are told.", None,
        ("A written key-drop agreement exists: the driver may do it with photos of the car, the parking spot and the keys going in."
         if agreed else
         "No written agreement: the driver must not leave the keys. Ask the site for a named receiver; [person only] the customer can give written agreement."),
        "agent_alone" if agreed else "person_decides",
        ["check for a written key-drop agreement"],
        [NO_CUSTOMER] + ([NO_ESCALATE] if agreed else ["allow the key drop without written agreement"]),
    )


# ================================================================== evidence and documents


@template
def photos_missing(v):
    return case(
        v, "DELIVERY_PHOTOS_MISSING", "evidence_documents", "after_delivery", "low",
        "The driver completed delivery without delivery photos.",
        v.order(delivery=f"delivered {v.local(v.later(-1), v.to_zone)} {v.to_zone}"),
        [("Delivery proof requires at least 6 photos; 0 uploaded.", "proof requirement")], [],
        "Your upload failed on poor signal; the photos are in your gallery.", None,
        "Ask the driver to upload the photos from the gallery and check they arrive.",
        "agent_alone", ["ask the driver to upload the photos"], [NO_ESCALATE, "mark the proof complete"],
    )


@template
def cmr_signature(v):
    copy = v.chance(0.6)
    return case(
        v, "CMR_RECEIVER_SIGNATURE_MISSING", "evidence_documents", "after_delivery", "medium",
        "The digital CMR has no receiver signature.",
        v.order(delivery=f"delivered {v.local(v.later(-20), v.to_zone)} {v.to_zone}"),
        [("Digital CMR: receiver signature empty.", "document")], [],
        ("The receiver signed a paper copy; you have a photo." if copy else "You forgot to ask for a signature."),
        ("We can send a scan of the signed copy." if copy else "We will not sign afterwards without a manager."),
        ("Get the driver's photo and the site's scan of the signed paper copy and attach them." if copy else
         "Neither a copy nor a later signature is available. Hand over with what was tried. [person only] Customer may confirm receipt."),
        "agent_alone" if copy else "person_decides",
        ["ask the driver and the delivery site"], [NO_CUSTOMER, "mark the CMR signed without a copy"] + ([NO_ESCALATE] if copy else []),
    )


@template
def vat_confirmation(v):
    v.from_country, (v.from_zone, cities) = "DE", CITIES["DE"]
    v.from_city = v.rng.choice(cities)
    v.seller = v.company("DE")
    return case(
        v, "SELLER_WANTS_VAT_CONFIRMATION", "evidence_documents", "before_pickup", "high",
        "The seller will only release the car once the buyer signs an EU arrival confirmation for VAT.",
        v.order(pickup=v.pickup_window(v.pick(20, 26))[1]),
        [("The buyer is our customer; the sale is VAT-free within the EU.", "order")],
        [v.msg(30, "site", "operator", "email", "We need the buyer's signed arrival confirmation (Gelangensbestätigung) before release.")],
        None, "A written promise from the buyer now is enough; the signature can follow after delivery.",
        "Ask the site what is needed and when. The document must come from the buyer. [person only] Ask the customer.",
        "person_only", ["ask the site exactly what is needed", "hand the customer request to a person"],
        [NO_CUSTOMER, "sign on the buyer's behalf"],
    )


@template
def blurry_photos(v):
    still_there = v.chance(0.5)
    return case(
        v, "PICKUP_PHOTOS_UNUSABLE", "evidence_documents", "in_transit" if not still_there else "before_pickup", "medium",
        "The pickup photos are blurry and do not show the car's condition.",
        v.order(pickup=v.pickup_window(-1)[1]),
        [("Pickup proof: 8 photos, all blurred.", "proof review")], [],
        ("You are still at the seller's yard." if still_there else "You left the yard 2 hours ago."), None,
        ("The driver is still at the yard: ask for a new set now, in daylight, all sides." if still_there else
         "The driver has left; new photos would not be pickup condition. Ask for photos at the next stop labelled with time and place. "
         "[approval] Accepting the weaker evidence."),
        "agent_alone" if still_there else "person_decides",
        ["ask the driver for new photos"], [NO_CUSTOMER, "present later photos as pickup condition"] + ([NO_ESCALATE] if still_there else []),
    )


# ================================================================== costs


@template
def lost_receipt(v):
    amount = v.pick(18, 32, 45, 60, 74)
    return case(
        v, "EXPENSE_RECEIPT_LOST", "costs", "after_delivery", "low",
        f"A driver claims EUR {amount} but lost the receipt.",
        v.order(delivery=f"delivered {v.local(v.later(-30), v.to_zone)} {v.to_zone}"),
        [(POLICY["receipts"], "driver policy")],
        [v.msg(5, "driver", "operator", "driver_app", f"I paid {amount} euros for fuel but lost the receipt.")],
        "You paid by card and can screenshot your bank app.", None,
        "Explain that a card statement line is accepted; ask for the screenshot and attach it. [approval] A person approves the expense.",
        "person_decides", ["apply the receipt policy", "ask for the card statement"], ["approve the expense", "refuse the claim outright"],
    )


@template
def toll_question(v):
    on_route = v.chance(0.7)
    bridge = v.pick("Great Belt bridge", "Øresund bridge", "Fehmarn Belt ferry", "Svinesund bridge")
    return case(
        v, "TOLL_REIMBURSEMENT_QUESTION", "costs", "in_transit", "low",
        f"The driver asks whether the {bridge} toll is reimbursed.",
        v.order(delivery=v.delivery_window(v.pick(5, 9))[1]),
        [(POLICY["tolls"], "driver policy"), (f"The {bridge} is {'on' if on_route else 'not on'} the planned route.", "route")],
        [v.msg(4, "driver", "operator", "driver_app", f"Is the {bridge} toll paid back?")],
        "You want a clear answer.", None,
        (f"Yes: the {bridge} is on the planned route; keep the receipt." if on_route else
         f"The {bridge} is not on the planned route. Ask why the driver wants it; [approval] a person decides on reimbursing a detour."),
        "agent_alone" if on_route else "person_decides",
        ["answer from the toll policy and the planned route"], [] + ([NO_ESCALATE] if on_route else ["promise reimbursement for a detour"]),
    )


@template
def parking_cost(v):
    amount = v.pick(8, 14, 19, 24, 32, 45)
    within = amount <= 25
    return case(
        v, "PARKING_EXPENSE", "costs", "in_transit", "low",
        f"The driver paid EUR {amount} for parking while waiting for a handover.",
        v.order(delivery=v.delivery_window(v.pick(2, 4))[1]),
        [(POLICY["parking"], "driver policy")],
        [v.msg(6, "driver", "operator", "driver_app", f"I paid {amount} euros parking while waiting. Can I claim it?")],
        "You have the receipt.", None,
        (f"EUR {amount} is within the EUR 25 parking policy: tell the driver to claim it with the receipt." if within else
         f"EUR {amount} is above the EUR 25 parking policy: ask why and pass it on. [approval] A person decides."),
        "agent_alone" if within else "person_decides",
        ["apply the EUR 25 parking limit"], [] + ([NO_ESCALATE] if within else ["approve a cost above the limit"]),
    )


@template
def fine_forwarded(v):
    return case(
        v, "TRAFFIC_FINE_FORWARDED", "costs", "after_delivery", "medium",
        "A customer forwards a traffic fine received weeks after delivery.",
        v.order(delivery=f"delivered {v.local(v.later(-24 * 20), v.to_zone)} {v.to_zone}"),
        [(f"Fine: {v.pick('speeding 18 km/h over', 'red light', 'parking in a no-stopping zone')}, during the job dates.", "customer email attachment"),
         ("Tracking places the job's driver at that place and time.", "tracking")],
        [v.msg(60, "customer", "operator", "email", "We received this fine for the car you delivered. Please handle it.")],
        None, None,
        "Match the fine's time and place with the job's tracking and prepare the file. [person only] Reply to the customer and decide how it reaches the driver.",
        "person_only", ["match the fine with the tracking"], [NO_CUSTOMER, "charge the driver"],
    )


@template
def fee_dispute(v):
    return case(
        v, "DRIVER_FEE_DISPUTE", "costs", "after_delivery", "medium",
        "A driver says the fee paid is lower than the offer they accepted.",
        v.order(delivery=f"delivered {v.local(v.later(-24 * 10), v.to_zone)} {v.to_zone}"),
        [(f"Accepted offer: EUR {v.pick(420, 480, 530)}; paid: EUR {v.pick(380, 400, 440)}; a deduction for a late delivery is recorded.", "payments")],
        [v.msg(15, "driver", "operator", "driver_app", "I was paid less than the offer. Why?")],
        "You think the delay was not your fault.", None,
        "Show the driver the recorded deduction and its reason. The driver disputes it, so [approval] a person reviews the deduction.",
        "person_decides", ["find the recorded reason for the difference"], ["reverse the deduction", "promise a refund"],
    )


# ================================================================== order data


@template
def vin_missing(v):
    knows = v.chance(0.7)
    return case(
        v, "VIN_MISSING_ON_ORDER", "order_data", "intake", "medium",
        "The order has no VIN or plate; pickup is tomorrow.",
        v.order(pickup=v.pickup_window(v.pick(20, 26))[1]),
        [("VIN and plate are empty on the order.", "order")], [], None,
        ("The car for this order has VIN WVWZZZ1KZ0P123456 (fictional), plate shown on the car." if knows else "We have several similar cars; we cannot tell which one is meant."),
        ("Ask the pickup site, not the customer, for the VIN; record it with the site as source." if knows else
         "The site cannot identify the car. [person only] Ask the customer which car they bought."),
        "agent_alone" if knows else "person_only",
        ["ask the pickup site first", "record the source of the VIN"], [NO_CUSTOMER, "invent a VIN"] + ([NO_ESCALATE] if knows else []),
    )


@template
def date_change(v):
    return case(
        v, "DELIVERY_DATE_CHANGE_REQUEST", "order_data", "before_pickup", "medium",
        "The customer asks by email to receive the car a day later.",
        v.order(delivery=v.delivery_window(v.pick(40, 60))[1]),
        [("The driver has another job the day after delivery.", "driver bookings")],
        [v.msg(20, "customer", "operator", "email", "Could you deliver one day later? Our workshop is full.")],
        "A day later clashes with your next job.", None,
        "Check what a later date means for the driver and plan; prepare options. [approval] Date change. [person only] Reply to the customer.",
        "person_decides", ["check the driver's next booking", "prepare options"], [NO_CUSTOMER, "change the date"],
    )


@template
def contact_missing(v):
    managed = v.chance(0.55)
    return case(
        v, "PICKUP_CONTACT_MISSING", "order_data", "intake", "medium",
        f"The pickup has no contact person; the address is a {'dealer site' if managed else 'private home'}.",
        v.order(pickup=v.pickup_window(v.pick(30, 48))[1]),
        [(("Site profile: front desk handles releases, email on file." if managed else "Private seller; no phone or email on the order."), "site profile" if managed else "order")],
        [], None, ("Front desk: ask for the used-car manager." if managed else None),
        ("Ask the site's front desk who releases the car and record the name." if managed else
         "The private seller can only be reached through the customer. [person only] Ask the customer for a contact."),
        "agent_alone" if managed else "person_only",
        ["use the site profile or hand over"], [NO_CUSTOMER] + ([NO_ESCALATE] if managed else ["guess a contact"]),
    )


@template
def duplicate_order(v):
    return case(
        v, "POSSIBLE_DUPLICATE_ORDER", "order_data", "intake", "medium",
        "Two new orders from the same customer have the same VIN.",
        v.order(pickup=v.pickup_window(v.pick(40, 70))[1], driver=False),
        [(f"Order {v.ref} and order T-{9000 + v.index} share VIN and route; created 6 minutes apart.", "orders")], [], None, None,
        "Put the second order on hold before an offer goes out and show both. [person only] Ask the customer whether both are intended.",
        "person_only", ["show both orders side by side"], [NO_CUSTOMER, "cancel an order"],
    )


# ================================================================== support


@template
def app_login(v):
    return case(
        v, "DRIVER_APP_LOGIN", "support", "before_pickup", "low",
        "A driver cannot log in to the app.",
        v.order(pickup=v.pickup_window(v.pick(14, 20))[1]),
        [("Standard fix: 'Forgot password' sends a reset link within 5 minutes.", "support guide")],
        [v.msg(4, "driver", "operator", "sms", "I can't log in, wrong password.")],
        "The reset works.", None, "Give the reset steps and confirm the driver sees the job.",
        "agent_alone", ["give the reset steps"], [NO_ESCALATE, "share account details in chat"],
    )


@template
def payment_date(v):
    approved = v.chance(0.7)
    return case(
        v, "PAYMENT_DATE_QUESTION", "support", "after_delivery", "low",
        "A driver asks when they will be paid.",
        v.order(delivery=f"delivered {v.local(v.later(-24 * 4), v.to_zone)} {v.to_zone}"),
        [(POLICY["pay"], "driver policy"), (("Proofs approved 3 days ago." if approved else "Proofs still waiting for review."), "proof review")],
        [v.msg(5, "driver", "operator", "driver_app", "When do I get paid?")],
        "You want a date.", None,
        ("Proofs were approved 3 days ago: payment within 11 more days at the latest." if approved else
         "Proofs are not reviewed yet; payment comes within 14 days after approval. Say so without promising a date."),
        "agent_alone", ["apply the payment rule"], [NO_ESCALATE, "promise an earlier date"],
    )


@template
def insurance_question(v):
    return case(
        v, "DRIVER_INSURANCE_QUESTION", "support", "before_pickup", "low",
        "A driver asks whether they are insured while driving a customer's car.",
        v.order(pickup=v.pickup_window(v.pick(20, 40))[1]),
        [("Support guide: every job is covered by the company's transit insurance; drivers report damage in the app at once.", "support guide")],
        [v.msg(6, "driver", "operator", "driver_app", "Am I insured when I drive the car?")],
        "You want a short answer.", None, "Answer from the support guide: covered by transit insurance, report any damage in the app at once.",
        "agent_alone", ["answer from the support guide"], [NO_ESCALATE, "invent coverage details"],
    )


# ================================================================== route helpers for the templates below


def route(v, origin, destination, cities_to=None):
    """Force a route, keeping the variant's random choice of cities."""
    v.from_country, (v.from_zone, cities) = origin, CITIES[origin]
    v.from_city = v.rng.choice(cities)
    v.to_country, (v.to_zone, cities) = destination, CITIES[destination]
    v.to_city = v.rng.choice(cities_to or cities)
    v.ferry = FERRIES.get((origin, destination))
    v.customer = v.company(destination)


def ferry_route(v):
    route(v, v.pick("DE", "DE", "SE", "EE"), "FI")


# ================================================================== more on the road


@template
def break_in(v):
    stolen = v.chance(0.35)
    return case(
        v, "VEHICLE_THEFT_OR_BREAK_IN", "on_the_road", "in_transit", "critical",
        "The car was " + ("stolen from" if stolen else "broken into at") + " a hotel car park overnight.",
        v.order(delivery=v.delivery_window(v.pick(5, 24))[1]),
        [("The driver stayed overnight on the planned route.", "travel booking")],
        [v.msg(6, "driver", "operator", "driver_app",
               "The car is gone from the car park!" if stolen else f"Someone smashed the {v.pick('rear side', 'driver side', 'passenger side')} window of the car overnight.")],
        ("The car is not where you parked it. You have both keys. You have not called the police yet." if stolen else
         "Glass on the seats; the papers in the glovebox are still there; nothing else seems taken. The car would start. You have not called the police yet."),
        None,
        ("Tell the driver to call the police now and get the report number; confirm the driver has both keys. Collect the place, time and "
         "hotel details. [person only] Inform the customer. [approval] Any insurance claim or travel home for the driver."
         if stolen else
         "Tell the driver to report the break-in to the police and get the report number, photograph the damage before touching anything, "
         "and check the papers and keys. Do not drive with a broken window until a person decides. [approval] Glass repair or covering. "
         "[person only] Inform the customer."),
        "person_decides",
        ["tell the driver to report to the police", "ask for photos and the report number"] + (["confirm where the keys are"] if stolen else []),
        [NO_CUSTOMER, "book a repair without approval"],
    )


@template
def keys_lost(v):
    found = v.chance(0.45)
    return case(
        v, "KEYS_LOST_BY_DRIVER", "on_the_road", "in_transit", "high",
        "The driver cannot find the car key at a service area stop.",
        v.order(delivery=v.delivery_window(v.pick(5, 9, 24))[1]),
        [("The seller handed over 2 keys; the second key is in the order envelope with the papers.", "pickup handover")],
        [v.msg(4, "driver", "operator", "driver_app", "I can't find the car key. I've looked in my pockets.")],
        ("When asked to check the order envelope and your bag, you find the key in the side pocket of your bag." if found else
         "The key is nowhere: not in your bag, the car or the café. The second key is in the envelope in the locked car."),
        None,
        ("Ask the driver to check systematically: bag, envelope, the café counter. The key turns up in the bag: carry on."
         if found else
         "Ask the driver to search systematically and ask the service area staff. The spare key is locked in the car with the papers. "
         "Look up a locksmith or roadside opening. [approval] Opening service and cost. [person only] Customer if the key is lost for good."),
        "agent_alone" if found else "person_decides",
        ["ask the driver to search systematically"],
        [NO_CUSTOMER] + ([NO_ESCALATE] if found else ["book a locksmith without approval"]),
    )


@template
def keys_locked_in(v):
    return case(
        v, "KEYS_LOCKED_IN_CAR", "on_the_road", "in_transit", "medium",
        "The driver locked the only key inside the car at a fuel stop.",
        v.order(delivery=v.delivery_window(v.pick(4, 8, 22))[1]),
        [("The second key is with the seller.", "pickup handover"),
         (f"Roadside opening service nearby: about {v.pick(40, 55, 70)} minutes, EUR {v.pick(90, 120, 150)}.", "service search, not booked")],
        [v.msg(3, "driver", "operator", "driver_app", "Stupid of me, the key is locked in the car at the fuel station.")],
        "You are fine, the car is locked and safe at the pump area; the station staff asked you to move it when you can.", None,
        "Check the car is not blocking anything dangerous, then prepare the opening service option with time and price. "
        "[approval] Booking the opening service.",
        "person_decides",
        ["prepare the opening service with time and cost"],
        [NO_CUSTOMER, "book without approval", "suggest breaking a window"],
    )


@template
def wrong_fuel(v):
    started = v.chance(0.4)
    fuel = v.pick(("petrol", "diesel"), ("diesel", "petrol"))
    return case(
        v, "WRONG_FUEL", "on_the_road", "in_transit", "high" if not started else "critical",
        f"The driver filled a {fuel[1]} car with {fuel[0]}" + (" and drove off." if started else "; the engine has not been started."),
        v.order(delivery=v.delivery_window(v.pick(5, 9, 24))[1]),
        [(f"The car runs on {fuel[1]}.", "vehicle record")],
        [v.msg(2, "driver", "operator", "driver_app", f"I think I put {fuel[0]} in it. " + ("The engine started coughing after 2 km, I stopped." if started else "I haven't started it."))],
        ("You stopped on the shoulder, safe; engine off." if started else "You are at the pump, engine off, key out."),
        None,
        ("Tell the driver not to restart the engine. Confirm they are safe. Look up a fuel drain service or towing. [approval] Service and cost. "
         "[person only] Inform the customer: the engine may need checking."
         if started else
         "Tell the driver not to start the engine or even switch on the ignition. Look up a mobile fuel drain service. [approval] Service and cost."),
        "person_decides",
        ["tell the driver not to start the engine"],
        [NO_CUSTOMER, "tell the driver to drive on", "book without approval"],
    )


@template
def serious_accident(v):
    return case(
        v, "SERIOUS_ACCIDENT_INJURY", "on_the_road", "in_transit", "critical",
        "The driver reports a serious accident with someone injured.",
        v.order(delivery=v.delivery_window(v.pick(5, 24))[1]),
        [],
        [v.msg(1, "driver", "operator", "driver_app", f"Accident on the {v.pick('A7', 'E4', 'E20', 'A1', 'E18')}. The other driver is hurt. I don't know what to do.")],
        v.pick("You have not called emergency services yet.", "Someone else is calling 112, you are not sure."),
        None,
        "Emergency first: tell the driver to call 112 (or confirm it is called), stay safe behind the barrier and help only if safe. "
        "Do not ask for photos or papers now. Hand over to a person at once; a person calls the driver.",
        "person_only",
        ["tell the driver to call 112 or confirm it was called", "hand over to a person immediately"],
        [NO_CUSTOMER, "ask for photos before the emergency is handled", "discuss fault or insurance"],
    )


@template
def bridge_closed(v):
    # Only destinations reached from Germany over the bridge: Zealand for the Great Belt, Sweden for Øresund.
    country = v.pick("DK", "SE")
    route(v, "DE", country, cities_to=["Copenhagen", "Roskilde"] if country == "DK" else ["Malmö", "Helsingborg", "Gothenburg"])
    bridge = "Great Belt bridge" if v.to_country == "DK" else "Øresund bridge"
    reopens = v.chance(0.5)
    start, window, end = v.delivery_window(v.pick(5, 6, 7))
    return case(
        v, "BRIDGE_CLOSED_WIND", "on_the_road", "in_transit", "medium",
        f"The {bridge} is closed to traffic because of a storm.",
        v.order(delivery=window),
        [(f"Bridge operator: closed for high wind, {'expected to reopen in about 2 hours' if reopens else 'closed at least until tomorrow morning'}.", "traffic feed"),
         (("With a 2-hour wait the ETA is still inside the delivery window." if reopens else
           "The alternative ferry route adds about 4 hours and misses the delivery window."), "route planner")],
        [v.msg(5, "driver", "operator", "driver_app", f"The {bridge} is closed, there's a storm.")],
        "You are parked safely before the bridge.", None,
        ("The bridge should reopen in about 2 hours and delivery still fits the window: tell the driver to wait somewhere safe and keep watching."
         if reopens else
         "The bridge stays closed until tomorrow. Prepare both options: wait overnight, or the ferry detour. [approval] Hotel or ferry cost. "
         "[person only] Customer message about the late delivery."),
        "agent_alone" if reopens else "person_decides",
        ["check when the bridge reopens", "compare with the delivery window"],
        [NO_CUSTOMER, "tell the driver to cross a closed bridge"] + ([NO_ESCALATE] if reopens else []),
    )


@template
def app_outage(v):
    jobs = v.pick(6, 9, 14, 21)
    confirmed = v.chance(0.6)
    return case(
        v, "TRACKING_OUTAGE_MANY_JOBS", "on_the_road", "in_transit", "medium",
        f"{jobs} moving jobs lost their driver-app position within the same 10 minutes.",
        v.order(delivery=v.delivery_window(v.pick(6, 10))[1]),
        [(f"{jobs} tracking gaps started between {v.clock(v.later(minutes=-40), 'UTC')} and {v.clock(v.later(minutes=-30), 'UTC')} UTC.", "tracking"),
         (("App status page: positions are delayed for all users since 30 minutes." if confirmed else "App status page: all systems normal."), "status page")],
        [], "Your app shows 'no connection to server' but you are driving normally.", None,
        ("Many gaps at the same minute and a confirmed app outage: it is a system problem, not {jobs} incidents. Do not message every driver; "
         "check one or two, tell the internal tech team and watch for recovery.".format(jobs=jobs) if confirmed else
         "Many gaps at once with no confirmed outage: ask two or three drivers whether their app connects; if they confirm an app problem, "
         "report it to the internal tech team and keep watching."),
        "agent_alone",
        ["recognise many gaps at once as one likely cause", "report it internally"],
        [NO_CUSTOMER, "open an incident for every job", NO_ESCALATE],
    )


# ================================================================== more driver travel


@template
def ferry_sold_out(v):
    ferry_route(v)
    hotel = v.chance(0.5)
    return case(
        v, "FERRY_SOLD_OUT", "driver_travel", "in_transit", "high",
        "The planned ferry crossing is sold out for cars.",
        v.order(delivery=v.delivery_window(v.pick(20, 30))[1]),
        [(f"Route {v.ferry}: the planned sailing has no car space (quote check, nothing booked).", "ferry line website"),
         (f"Next sailing with space leaves {'tomorrow morning; a hotel night would be needed' if hotel else 'in 5 hours, same day'}; fare EUR {v.pick(180, 220, 260)}.", "ferry line quote, not booked")],
        [v.msg(7, "driver", "operator", "driver_app", "The ferry is full, they say no space for cars.")],
        "You are near the terminal and can wait.", None,
        "Treat the quotes as quotes. Prepare the next sailing with space" + (" and a hotel night" if hotel else "") + ", with the new delivery estimate. "
        "[approval] Booking and costs. [person only] Customer message if the delivery promise moves.",
        "person_decides",
        ["treat quotes as quotes, not bookings", "prepare the next sailing with its effect on delivery"],
        [NO_CUSTOMER, "book the ferry without approval"],
    )


@template
def ferry_cancelled(v):
    ferry_route(v)
    in_time = v.chance(0.45)
    reason = v.pick("a storm", "a technical fault", "a strike")
    return case(
        v, "FERRY_CANCELLED_BY_CARRIER", "driver_travel", "in_transit", "medium" if in_time else "high",
        f"The ferry line cancelled the booked sailing because of {reason}.",
        v.order(delivery=v.delivery_window(v.pick(18, 26))[1]),
        [(f"Ferry line notice: sailing cancelled ({reason}); booking moved automatically to the next sailing.", "carrier notice"),
         (("The next sailing still arrives in time for the delivery window." if in_time else "The next sailing arrives after the delivery window."), "timetable")],
        [v.msg(15, "driver", "operator", "driver_app", "Got a text that my ferry is cancelled?")],
        "You received the carrier's text with the new sailing.", None,
        ("The carrier moved the booking at no cost and delivery still fits: confirm the new sailing with the driver."
         if in_time else
         "The carrier moved the booking but delivery will be late. Prepare the new estimate. [person only] Customer message. "
         "[approval] Any extra cost, e.g. a hotel."),
        "agent_alone" if in_time else "person_decides",
        ["read the carrier notice", "check the new arrival against the window"],
        [NO_CUSTOMER] + ([NO_ESCALATE] if in_time else []),
    )


@template
def ferry_connection_risk(v):
    ferry_route(v)
    margin = v.pick(-40, -15, 20, 45, 70)
    return case(
        v, "FERRY_CONNECTION_AT_RISK", "driver_travel", "in_transit", "medium" if margin > 0 else "high",
        "Traffic is slowing the driver on the way to the ferry terminal.",
        v.order(delivery=v.delivery_window(v.pick(20, 26))[1]),
        [(f"Check-in closes at {v.clock(v.later(3), v.from_zone)} local.", "travel booking"),
         (f"Navigation ETA at the terminal: {v.clock(v.later(3, -margin), v.from_zone)} local.", "driver app")],
        [v.msg(4, "driver", "operator", "driver_app", "Heavy traffic. Will I make the ferry?")],
        "You are driving, hands-free.", None,
        (f"The driver should reach check-in {margin} minutes before it closes: tell them it is fine and keep watching."
         if margin > 0 else
         f"The driver would arrive {-margin} minutes after check-in closes. Before it happens, prepare the next sailing and its effect. "
         "[approval] Rebooking. Do not tell the driver to speed."),
        "agent_alone" if margin > 0 else "person_decides",
        ["compare the ETA with the check-in deadline"],
        [NO_CUSTOMER, "tell the driver to drive faster"] + ([NO_ESCALATE] if margin > 0 else []),
    )


# ================================================================== more pickup readiness


@template
def seller_refuses(v):
    document = v.chance(0.45)
    return case(
        v, "SELLER_REFUSES_RELEASE", "pickup_readiness", "before_pickup", "high",
        "The seller refuses to hand over the car to the driver.",
        v.order(pickup=v.pickup_window(-1)[1]),
        [(("A signed release authority for this car is in the order documents." if document else "No release authority on file."), "documents"),
         ("The buyer is our customer.", "order")],
        [v.msg(3, "driver", "operator", "driver_app", "The seller won't give me the car.")],
        "You are at the seller's desk.",
        ("We need the buyer's signed release authority before we hand over." if document else
         v.pick("We have not received the payment from the buyer.", "Our manager put a hold on this car until the paperwork is settled.")),
        ("The site only needs the release authority, which is on file: send it to the site and let the driver collect."
         if document else
         "The reason is between the seller and the buyer (payment or hold). Tell the driver to wait or leave politely; do not argue. "
         "[person only] The customer settles it with the seller. [approval] Waiting time or a new slot."),
        "agent_alone" if document else "person_only",
        ["ask the site exactly why"],
        [NO_CUSTOMER, "pressure the seller"] + ([NO_ESCALATE] if document else ["promise payment on the customer's behalf"]),
    )


@template
def car_not_found(v):
    other_yard = v.chance(0.5)
    return case(
        v, "VEHICLE_NOT_FOUND_AT_SITE", "pickup_readiness", "before_pickup", "high",
        "The driver is at the booked site, but the car is not there.",
        v.order(pickup=v.pickup_window(-1)[1]),
        [("Pickup address: the seller's main showroom.", "order")],
        [v.msg(3, "driver", "operator", "driver_app", "The car is not here. Staff can't find it.")],
        "You are at the showroom and can drive or take a taxi a few km.",
        (f"The car and both keys are at our second yard, {v.pick(2, 3, 4)} km away; they can release it there today." if other_yard else
         "We cannot find this car in our stock. We will check with stock control; maybe it was sold or moved."),
        ("The site confirms the car and keys at its own second yard nearby and can release there: send the driver there, record the new "
         "pickup point with the site as source."
         if other_yard else
         "Hold the collection; nobody knows where the car is. Record what the site said. [person only] The customer reconciles with the seller. "
         "[approval] Waiting time or ending the driver's trip."),
        "agent_alone" if other_yard else "person_decides",
        ["ask the site where the car is"],
        [NO_CUSTOMER, "mark the car as collected"] + ([NO_ESCALATE] if other_yard else []),
    )


@template
def condition_worse(v):
    major = v.chance(0.45)
    damage = v.pick("a deep dent in the rear door", "a cracked windscreen", "a warning light on the dashboard", "a damaged front bumper") if major else \
        v.pick("a small scratch on the bumper", "a stone chip on the bonnet", "kerb marks on one wheel")
    return case(
        v, "CONDITION_WORSE_THAN_DESCRIBED", "pickup_readiness", "before_pickup", "high" if major else "low",
        f"At pickup the car has {damage} not mentioned in the order.",
        v.order(pickup=v.pickup_window(-1)[1]),
        [("Order: car described as 'no visible damage'.", "order")],
        [v.msg(3, "driver", "operator", "driver_app", f"The car has {damage}. The order says no damage.")],
        "You can photograph everything.", "That was there when we took the car in.",
        ("Minor: photograph it, have the site write it on the handover paper, and collect."
         if not major else
         "Major damage not in the description: photograph it and get it on the handover paper, but do not leave yet. "
         "[person only] The customer decides whether to take the car as it is."),
        "agent_alone" if not major else "person_decides",
        ["ask for photos", "get the damage written on the handover paper"],
        [NO_CUSTOMER] + ([NO_ESCALATE] if not major else ["collect before the customer decides"]),
    )


@template
def odometer(v):
    diff = v.pick(120, 300, 450, 6000, 14000, 30000)
    big = diff > 5000
    return case(
        v, "ODOMETER_MISMATCH", "pickup_readiness", "before_pickup", "high" if big else "low",
        f"The odometer reads {diff} km more than the order states.",
        v.order(pickup=v.pickup_window(-1)[1]),
        [(f"Order mileage: {v.pick(42000, 58000, 76000)} km, recorded when the car was listed.", "order")],
        [v.msg(3, "driver", "operator", "driver_app", f"The km on the car is {diff} more than on the order.")],
        "You sent a photo of the odometer.", ("The car was used for test drives since listing." if not big else "That's what it shows; we can't explain it."),
        ("A small difference is normal after listing: record the photo and the site's explanation and collect."
         if not big else
         "A large difference may mean the wrong car or a wrong listing: check the VIN, photograph it, and do not leave yet. "
         "[person only] The customer decides."),
        "agent_alone" if not big else "person_decides",
        ["ask for an odometer photo"],
        [NO_CUSTOMER] + ([NO_ESCALATE] if not big else ["collect before the customer decides"]),
    )


@template
def ev_empty(v):
    v.vehicle_name, v.ev = v.pick(*[x for x in VEHICLES if x[1]])
    charger = v.chance(0.55)
    return case(
        v, "EV_HANDED_OVER_EMPTY", "pickup_readiness", "before_pickup", "medium",
        f"The electric car is handed over at {v.pick(3, 5, 7)}% charge.",
        v.order(pickup=v.pickup_window(-1)[1]),
        [(POLICY["charging"], "driver policy"),
         (("A fast charger is 1 km away; 30 minutes gives enough range, about EUR 30." if charger else
           "No fast charger within range; the site has only a slow socket (about 8 hours for enough range)."), "charger map")],
        [v.msg(3, "driver", "operator", "driver_app", "The car is almost empty. What do I do?")],
        "You can drive 1 km safely.", None,
        ("Tell the driver to charge at the nearby fast charger (about EUR 30, within policy), keep the receipt and go."
         if charger else
         "No fast charger in range: an 8-hour slow charge changes the plan. [approval] Waiting time and plan change; ask the site if they can charge overnight."),
        "agent_alone" if charger else "person_decides",
        ["check the charging options and the policy"],
        [NO_CUSTOMER] + ([NO_ESCALATE] if charger else []),
    )


@template
def driver_id_mismatch(v):
    accepts = v.chance(0.5)
    return case(
        v, "DRIVER_ID_MISMATCH_AT_RELEASE", "pickup_readiness", "before_pickup", "high",
        "The release authority names a different driver than the one at the desk.",
        v.order(pickup=v.pickup_window(-1)[1]),
        [(f"Release authority names {v.other_driver}, the driver of an earlier, cancelled booking.", "documents")],
        [v.msg(3, "driver", "operator", "driver_app", "They say the paper has another driver's name on it.")],
        "You showed your ID.",
        ("We accept a job confirmation from the transport company with this driver's name." if accepts else
         "Only the buyer can change the name on the release authority."),
        ("The site accepts our job confirmation: send it to the site with the current driver's name."
         if accepts else
         "Only the buyer can reissue the release authority. [person only] Ask the customer for a corrected one. [approval] Waiting time."),
        "agent_alone" if accepts else "person_only",
        ["ask the site what they accept"],
        [NO_CUSTOMER, "ask the site to ignore the name"] + ([NO_ESCALATE] if accepts else []),
    )


# ================================================================== more dispatch


@template
def driver_no_show(v):
    answers = v.chance(0.55)
    return case(
        v, "DRIVER_NO_SHOW", "dispatch", "before_pickup", "high",
        "The pickup site says the driver has not turned up in the slot.",
        v.order(pickup=v.pickup_window(-1)[1]),
        [("Driver app: last position 3 h ago.", "tracking")],
        [v.msg(5, "site", "operator", "email", "Your driver was supposed to be here an hour ago. Nobody came.")],
        ("Your train was cancelled; you are 30 minutes away by taxi and forgot to tell anyone." if answers else None),
        "We are open until 17:00.",
        ("Reach the driver: they are 30 minutes away, inside the slot. Tell the site the new arrival time."
         if answers else
         "The driver does not answer messages or calls. Tell the site we are on it, and prepare a replacement driver. [approval] Reassignment."),
        "agent_alone" if answers else "person_decides",
        ["try to reach the driver", "answer the site"],
        [NO_CUSTOMER] + ([NO_ESCALATE] if answers else ["reassign without approval"]),
    )


@template
def double_assignment(v):
    return case(
        v, "DOUBLE_ASSIGNMENT", "dispatch", "before_pickup", "high",
        "Two drivers are booked on the same job.",
        v.order(pickup=v.pickup_window(v.pick(20, 30))[1]),
        [(f"Bookings: {v.driver} accepted at {v.clock(v.later(-5), 'UTC')} UTC, {v.other_driver} at {v.clock(v.later(-4, 30), 'UTC')} UTC.", "bookings")],
        [v.msg(10, "driver", "operator", "driver_app", "I got a booking confirmation, but another driver says he has the same job?")],
        "You are planning your travel.", None,
        "Find the earliest acceptance and tell both drivers to wait before buying travel. [approval] Cancelling the second booking, "
        "with any cancellation payout.",
        "person_decides",
        ["tell both drivers not to buy travel yet", "find which booking came first"],
        [NO_CUSTOMER, "cancel a booking without approval"],
    )


@template
def blocked_by_previous(v):
    in_slot = v.chance(0.5)
    return case(
        v, "DRIVER_BLOCKED_BY_PREVIOUS_JOB", "dispatch", "before_pickup", "medium",
        "The driver's previous delivery is running late and may delay this pickup.",
        v.order(pickup=v.pickup_window(v.pick(20, 26))[1]),
        [(("With the delay, the driver can still reach this pickup inside the slot." if in_slot else
           "With the delay and the required rest, the driver reaches this pickup the day after the slot."), "route planner")],
        [v.msg(6, "driver", "operator", "driver_app", "My delivery today is 3 hours late. Can I still do tomorrow's pickup?")],
        "You need your legal rest.", None,
        ("The driver still makes the slot after rest: keep the plan and watch."
         if in_slot else
         "The driver cannot make the slot with the required rest. Prepare a replacement or ask the site about a later slot. "
         "[approval] Reassignment or slot change."),
        "agent_alone" if in_slot else "person_decides",
        ["check the arrival with the driver's rest"],
        [NO_CUSTOMER, "ask the driver to skip rest"] + ([NO_ESCALATE] if in_slot else []),
    )


# ================================================================== more delivery handover


@template
def delivery_refused(v):
    reason = v.pick("it is the wrong trim level", "it has a scratch they did not expect", "it is not the colour they ordered", "the service book is missing")
    return case(
        v, "DELIVERY_REFUSED_BY_RECEIVER", "delivery_handover", "in_transit", "high",
        f"The receiver refuses to accept the car because {reason}.",
        v.order(delivery=v.delivery_window(-1)[1]),
        [(POLICY["keys"], "handover rule")],
        [v.msg(3, "driver", "operator", "driver_app", f"They won't take the car, they say {reason}.")],
        "You have the car and keys and can wait.", None,
        "Keep the car and keys with the driver; collect photos and the receiver's reason in writing. [person only] Settle with the customer. "
        "[approval] Waiting, storage or returning the car.",
        "person_only",
        ["keep the car and keys with the driver", "get the reason in writing"],
        [NO_CUSTOMER, "leave the car there", "argue with the receiver"],
    )


@template
def wrong_address(v):
    navigation = v.chance(0.55)
    return case(
        v, "DRIVER_AT_WRONG_ADDRESS", "delivery_handover", "in_transit", "medium",
        "The driver is at an address where nobody expects the car.",
        v.order(delivery=v.delivery_window(-1)[1]),
        [(f"Order delivery address: {v.pick('Teollisuuskatu', 'Industrivej', 'Hafenstraße', 'Storgatan')} {v.pick(4, 12, 27)}, {v.to_city}.", "order")],
        [v.msg(3, "driver", "operator", "driver_app", "Nobody here knows about the car.")],
        ("Your navigation took you to a street with a similar name." if navigation else "You are at the address on the order."),
        (None if navigation else "Our branch moved last month to the other side of town; the order has the old address."),
        ("The driver followed the wrong street: send the order address and check the arrival still fits the window."
         if navigation else
         "The order address is outdated according to the site. Do not move the delivery on the site's word alone. "
         "[approval] Address change. [person only] Confirm with the customer."),
        "agent_alone" if navigation else "person_decides",
        ["compare the driver's location with the order address"],
        [NO_CUSTOMER] + ([NO_ESCALATE] if navigation else ["change the delivery address alone"]),
    )


@template
def trade_in(v):
    ready = v.chance(0.5)
    return case(
        v, "TRADE_IN_RETURN", "delivery_handover", "in_transit", "medium",
        "After delivery the driver must take a trade-in car back.",
        v.order(delivery=v.delivery_window(-1)[1]),
        [(f"Trade-in: {v.pick(*[x[0] for x in VEHICLES])}, to be driven back to the seller.", "order item")],
        [v.msg(3, "driver", "operator", "driver_app", "Delivered. Where is the trade-in car?")],
        "You are ready to drive back.",
        ("The trade-in is ready with keys and papers." if ready else "The trade-in still has personal items in it and the papers are not signed; maybe tomorrow."),
        ("The trade-in is ready: photograph it, check keys and papers, and start the return leg."
         if ready else
         "The trade-in is not ready. Record what is missing. [approval] Driver waiting or a separate return trip. [person only] Customer."),
        "agent_alone" if ready else "person_decides",
        ["check the trade-in's keys and papers"],
        [NO_CUSTOMER] + ([NO_ESCALATE] if ready else []),
    )


# ================================================================== more order data


@template
def cancelled_en_route(v):
    return case(
        v, "CUSTOMER_CANCELS_DURING_TRAVEL", "order_data", "before_pickup", "high",
        "The customer cancelled the order while the driver is travelling to pickup.",
        v.order(pickup=v.pickup_window(v.pick(3, 5))[1]),
        [("Order cancelled by the customer 10 minutes ago; cancellation confirmed in the system.", "order"),
         ("The driver has been travelling for 2 hours on a booked train.", "travel booking")],
        [], "You are on the train, halfway.", None,
        "Tell the driver at once not to collect the car and to stop where sensible. [approval] Cancellation payout and the driver's way home.",
        "person_decides",
        ["tell the driver not to collect", "prepare the driver's way home"],
        [NO_CUSTOMER, "let the driver continue to pickup"],
    )


@template
def multi_car(v):
    cars = v.pick(2, 3, 4)
    return case(
        v, "MULTI_CAR_ORDER_PARTLY_READY", "order_data", "before_pickup", "medium",
        f"One order covers {cars} cars at the same site; one of them is not ready.",
        v.order(pickup=v.pickup_window(-1)[1]),
        [(f"{cars} cars, {cars} drivers booked for the same slot.", "order")],
        [v.msg(4, "driver", "operator", "driver_app", "My car is not ready, the others are leaving.")],
        "You are the driver of the car that is not ready.", "That car needs one more day in the workshop.",
        f"Let the {cars - 1} ready cars leave as planned. For the last car: [approval] driver waiting or a new slot. [person only] Customer.",
        "person_decides",
        ["let the ready cars go", "handle the car that is not ready separately"],
        [NO_CUSTOMER, "hold all cars because one is late"],
    )


@template
def invoice_question(v):
    return case(
        v, "CUSTOMER_INVOICE_QUESTION", "order_data", "after_delivery", "low",
        "A customer asks by email which invoice belongs to a delivered car.",
        v.order(delivery=f"delivered {v.local(v.later(-24 * 6), v.to_zone)} {v.to_zone}"),
        [("Invoice INV-{} issued for this order.".format(70000 + v.index), "billing")],
        [v.msg(30, "customer", "operator", "email", "Which invoice is for the car you delivered last week?")],
        None, None,
        "Find the invoice for this order and prepare the answer. [person only] A person replies to the customer.",
        "person_only", ["find the invoice for the order"], [NO_CUSTOMER],
    )


@template
def behaviour_complaint(v):
    return case(
        v, "DRIVER_BEHAVIOUR_COMPLAINT", "support", "after_delivery", "medium",
        f"A customer complains that the driver {v.pick('was rude', 'smoked in the car', 'arrived without notice', 'left rubbish in the car')}.",
        v.order(delivery=f"delivered {v.local(v.later(-24), v.to_zone)} {v.to_zone}"),
        [], [v.msg(40, "customer", "operator", "email", "We are not happy with how your driver behaved yesterday.")],
        None, None,
        "Gather the facts (delivery time, photos, driver's history) without judging. [person only] A person replies to the customer and talks to the driver.",
        "person_only", ["gather the facts"], [NO_CUSTOMER, "sanction the driver"],
    )


@template
def other_language(v):
    language, text, question = v.pick(
        ("de", "Wo soll ich die Tankquittung hochladen?", "where to upload the fuel receipt"),
        ("fi", "Mihin lataan polttoainekuitin?", "where to upload the fuel receipt"),
        ("sv", "Var laddar jag upp kvittot för bränslet?", "where to upload the fuel receipt"),
        ("da", "Hvor uploader jeg kvitteringen for brændstof?", "where to upload the fuel receipt"),
        ("de", "Muss ich den Schlüssel persönlich übergeben?", "whether keys must be handed over in person"),
        ("fi", "Pitääkö avaimet antaa henkilökohtaisesti?", "whether keys must be handed over in person"),
    )
    names = {"de": "German", "fi": "Finnish", "sv": "Swedish", "da": "Danish"}
    message = v.msg(4, "driver", "operator", "driver_app", text)
    message["language"] = language
    return case(
        v, "DRIVER_MESSAGE_OTHER_LANGUAGE", "support", "in_transit", "low",
        f"A driver asks in {names[language]} {question}.",
        v.order(delivery=v.delivery_window(v.pick(4, 8))[1]),
        [("Support guide: receipts are uploaded under 'Expenses' in the job screen of the app.", "support guide"), (POLICY["keys"], "handover rule")],
        [message], f"You prefer {names[language]} and read English poorly.", None,
        f"Answer in {names[language]}: " + ("upload it under 'Expenses' in the job screen." if "receipt" in question else
                                             "yes, keys go to a named person, never left unattended."),
        "agent_alone",
        [f"reply in {names[language]}", "answer from the guide"],
        [NO_ESCALATE, "reply only in English"],
    )


def build(per_type):
    """per_type variants of every template; variant numbers stay unique across templates."""
    return [template_(Variant(t * per_type + k)) for t, template_ in enumerate(TEMPLATES) for k in range(per_type)]


def main(per_type):
    records = []
    for index, built in enumerate(build(per_type), 1):
        record = test_cases.record(index, built)
        record["id"] = f"syn-{index:05d}"
        record["source"]["origin"] = "synthetic_variants"
        errors = []
        validate.check(record, validate.SCHEMA, "$", errors)
        if errors:
            raise SystemExit(f"{record['id']} ({built['code']}): {errors[:3]}")
        records.append(record)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
    print(f"{len(records)} cases, {per_type} per type, {len(TEMPLATES)} types -> {OUT}")


if __name__ == "__main__":
    args = sys.argv[1:]
    main(int(args[args.index("--per-type") + 1]) if "--per-type" in args else 50)
