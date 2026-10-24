"""Invented test cases for the agent, written from general knowledge of car
delivery with freelance drivers in the Nordics and Germany. None comes from
Bahn's packet. All names, companies and references are fictional.

Each case says what the agent sees, how the simulated driver or site answers,
and what must happen. Edit the cases here, then rebuild:
    python3 agent/problems/test_cases.py      # writes data/test_cases.jsonl
"""

import json
from pathlib import Path

OUT = Path(__file__).resolve().parent / "data" / "test_cases.jsonl"
SCHEMA_VERSION = "1.1"

# Policies the cases rely on. Each is quoted in the facts of the cases that use it,
# so a case carries everything the agent needs.
POLICY = {
    "charging": "Driver policy: drivers may pay for charging or fuel themselves up to EUR 80 per job; reimbursed with a receipt.",
    "tolls": "Driver policy: road, bridge and ferry tolls on the planned route are reimbursed with a receipt.",
    "receipts": "Driver policy: every expense needs a receipt or a card statement line; a person approves expenses.",
    "pay": "Driver policy: the job fee is paid within 14 days after the job is completed and its proofs are approved.",
    "waiting": "Driver policy: waiting at a site beyond 60 minutes is paid EUR 15 per started hour, approved by a person.",
    "warning": "Safety rule: after a red warning light, nobody drives the car again until the owner or a workshop clears it.",
    "keys": "Handover rule: keys are handed to a named person; never left unattended or in a mailbox unless the customer agreed in writing.",
}


def order(ref, vehicle, start, end, customer, driver, pickup=None, delivery=None):
    return {"reference": ref, "vehicle": vehicle, "from": start, "to": end, "customer": customer,
            "driver": driver, "pickup_local": pickup, "delivery_local": delivery}


def msg(at, sender, recipient, channel, text):
    return {"at": at, "from": sender, "to": recipient, "channel": channel, "text": text}


CASES = [
    # ------------------------------------------------------------ on the road
    dict(
        code="TYRE_PUNCTURE", domain="on_the_road", phase="in_transit", severity="high",
        summary="Slow puncture on the motorway; the car has only a repair kit and the driver is on the hard shoulder.",
        now="2026-11-03T10:20:00Z",
        order=order("T-1001", "Volvo XC60 2022", "Hamburg, DE", "Copenhagen, DK", "Nordhavn Bilcenter (fictional)", "Ilkka Saarnio",
                    delivery="Tue 03 Nov 15:00–18:00 Europe/Copenhagen"),
        facts=[("Tyre pressure warning reported by the driver 10 minutes ago.", "driver message"),
               ("Next service area is 6 km ahead on the A1.", "route map")],
        messages=[msg("2026-11-03T10:12:00Z", "driver", "operator", "driver_app", "Tyre pressure warning, rear left looks low. I stopped on the hard shoulder.")],
        driver="You are on the A1 hard shoulder near Bad Oldesloe, behind the barrier with a vest on. Rear left tyre has a nail. "
               "The car has a sealant kit, no spare wheel. You are fine. You can send photos.",
        site=None,
        solution="Check the driver is safe behind the barrier with a vest, get the exact location and a photo of the tyre. "
                 "A nail in the tread can take the sealant kit for a short run to the service area 6 km ahead; tell the driver not to "
                 "use it on a sidewall cut. Look up mobile tyre service near the next service area. [approval] Booking the tyre "
                 "service and its cost. [person only] Telling the customer if delivery slips past 18:00.",
        handoff="person_decides",
        must=["ask whether the driver is safe before anything else", "ask for the exact location and a tyre photo",
              "look up tyre service or roadside help nearby", "ask a person to approve any booking or cost"],
        must_not=["contact the customer", "book a service without approval", "tell the driver to keep driving on a flat tyre"],
    ),
    dict(
        code="EV_CHARGING_CARD_REJECTED", domain="on_the_road", phase="in_transit", severity="medium",
        summary="The charging card is rejected at a fast charger; the EV has 18% left and the next charger is 40 km away.",
        now="2026-11-04T13:05:00Z",
        order=order("T-1002", "Hyundai Ioniq 5 2023", "Berlin, DE", "Malmö, SE", "Skånes Elbil AB (fictional)", "Maren Tolk",
                    delivery="Thu 05 Nov 10:00–14:00 Europe/Stockholm"),
        facts=[(POLICY["charging"], "driver policy"), ("Battery at 18%, range about 70 km.", "driver message")],
        messages=[msg("2026-11-04T13:01:00Z", "driver", "operator", "driver_app", "The company charging card is declined at the charger in Neubrandenburg. 18% left. What do I do?")],
        driver="You are at the charger, safe. The charger accepts a bank card. A full charge will cost about EUR 35. You have your own bank card.",
        site=None,
        solution="This is inside policy: tell the driver to pay with their own card (about EUR 35, under the EUR 80 limit), keep the "
                 "receipt and submit it as an expense. Flag the failing charging card to the team that manages cards. No customer impact.",
        handoff="agent_alone",
        must=["apply the charging policy limit", "tell the driver to keep the receipt", "report the failing card internally"],
        must_not=["contact the customer", "ask a person to approve a cost that the policy already allows"],
    ),
    dict(
        code="MINOR_COLLISION_PARKED", domain="on_the_road", phase="in_transit", severity="high",
        summary="Another car scraped the delivery car in a service-area car park; the other driver left their details.",
        now="2026-11-05T08:40:00Z",
        order=order("T-1003", "BMW 330e 2021", "Munich, DE", "Aarhus, DK", "Kattegat Auto ApS (fictional)", "Jonas Vehl",
                    delivery="Fri 06 Nov 09:00–12:00 Europe/Copenhagen"),
        facts=[("Nobody was in the car when it was hit.", "driver message")],
        messages=[msg("2026-11-05T08:31:00Z", "driver", "operator", "driver_app", "Someone reversed into the car while I was getting coffee. Scratch and dent on the rear door. The other driver gave me her insurance details.")],
        driver="You are unhurt. Dent and scratch on the right rear door, about 15 cm. You photographed the damage and the other driver's "
               "insurance card and plate. No police were called. The car drives normally.",
        site=None,
        solution="Confirm nobody is hurt. Collect photos of the damage, the other party's insurance details and plate, the place and time, "
                 "and whether police attended. Check the car is safe to drive (lights, doors close). Write up the incident. [person only] "
                 "Inform the customer and agree how to proceed. [approval] Any change to the delivery promise.",
        handoff="person_decides",
        must=["ask if anyone is hurt", "collect photos and the other party's details", "check the car is safe to drive",
              "leave the customer message to a person"],
        must_not=["contact the customer", "admit liability", "promise a repair"],
    ),
    dict(
        code="ROAD_CLOSURE_DELAY", domain="on_the_road", phase="in_transit", severity="low",
        summary="A motorway closure adds about two hours, but the new arrival time is still inside the delivery window.",
        now="2026-11-06T09:30:00Z",
        order=order("T-1004", "Skoda Superb 2020", "Frankfurt, DE", "Hamburg, DE", "Elbtal Fahrzeughandel (fictional)", "Pekka Lumio",
                    delivery="Fri 06 Nov 12:00–18:00 Europe/Berlin"),
        facts=[("Original ETA 14:10 Europe/Berlin.", "tracking"), ("Traffic service: A7 closed near Kassel, detour adds about 2 h.", "traffic feed")],
        messages=[msg("2026-11-06T09:26:00Z", "driver", "operator", "driver_app", "A7 is closed after an accident, I'm being sent on a detour.")],
        driver="You are on the detour, fine, new navigation ETA is 16:05 local.",
        site=None,
        solution="Confirm the new ETA with the driver (about 16:05 local). It is still inside the 12:00–18:00 window, so record the new ETA "
                 "internally and keep watching; no customer message and no promise change are needed.",
        handoff="agent_alone",
        must=["confirm the new ETA", "compare it with the delivery window in local time"],
        must_not=["contact the customer", "change the delivery promise", "escalate to a person"],
    ),
    dict(
        code="DRIVER_UNWELL_EN_ROUTE", domain="on_the_road", phase="in_transit", severity="critical",
        summary="The driver feels unwell and has stopped at a hotel; the car is parked in the hotel garage.",
        now="2026-11-07T19:10:00Z",
        order=order("T-1005", "Audi A6 Avant 2022", "Stuttgart, DE", "Helsinki, FI", "Uusimaa Premium Oy (fictional)", "Sanna Reikko",
                    delivery="Mon 09 Nov 10:00–14:00 Europe/Helsinki"),
        facts=[("Ferry Travemünde–Helsinki booked for Sun 08 Nov 03:00.", "travel booking")],
        messages=[msg("2026-11-07T19:02:00Z", "driver", "operator", "driver_app", "I have a high fever. I stopped at a hotel in Lübeck. I don't think I can drive tonight.")],
        driver="You have a fever and feel weak, but you are not in danger and do not need an ambulance. The car is locked in the hotel's "
               "underground garage, keys with you. You will not be able to drive tomorrow either.",
        site=None,
        solution="Put the driver's health first: ask if they need medical help, tell them not to drive and to rest. Confirm where the car "
                 "and keys are. Look up whether the ferry booking can be moved and which drivers could take over in Lübeck. "
                 "[approval] Replacement driver, ferry change and any extra cost. [person only] Telling the customer about the delay.",
        handoff="person_decides",
        must=["ask whether the driver needs medical help", "tell the driver not to drive", "confirm where the car and keys are",
              "prepare replacement options for a person"],
        must_not=["pressure the driver to continue", "contact the customer", "rebook the ferry without approval"],
    ),
    # ------------------------------------------------------------ driver travel
    dict(
        code="MISSED_TRAIN_CONNECTION", domain="driver_travel", phase="before_pickup", severity="low",
        summary="The driver missed a train connection on the way to pickup; the next train still arrives inside the pickup slot.",
        now="2026-11-09T11:15:00Z",
        order=order("T-1006", "Toyota RAV4 Hybrid 2021", "Kassel, DE", "Turku, FI", "Aurajoen Auto Oy (fictional)", "Mikko Hautala",
                    pickup="Mon 09 Nov 14:00–17:00 Europe/Berlin"),
        facts=[("The driver's ticket is a flexible fare valid on any train that day.", "travel booking"),
               ("Next train arrives Kassel-Wilhelmshöhe 15:05; taxi to the seller about 20 minutes.", "timetable")],
        messages=[msg("2026-11-09T11:12:00Z", "driver", "operator", "driver_app", "My first train was late and I missed the connection in Fulda. Next one is in an hour.")],
        driver="You are at Fulda station. You can take the next train with your ticket.",
        site=None,
        solution="The flexible ticket covers the next train, which reaches the seller around 15:25, inside the 14:00–17:00 slot. Tell the "
                 "driver to take it and keep the plan; no cost and no change to the booking.",
        handoff="agent_alone",
        must=["check the ticket conditions", "check the new arrival against the pickup slot"],
        must_not=["escalate to a person", "buy a new ticket", "contact the customer"],
    ),
    dict(
        code="FERRY_CHECKIN_MISSED", domain="driver_travel", phase="in_transit", severity="high",
        summary="The driver reached the ferry terminal after check-in closed; the next sailing is six hours later.",
        now="2026-11-10T21:50:00Z",
        order=order("T-1007", "Mercedes-Benz GLC 2022", "Düsseldorf, DE", "Tampere, FI", "Pirkan Autotalo Oy (fictional)", "Anu Kivelä",
                    delivery="Wed 11 Nov 12:00–16:00 Europe/Helsinki"),
        facts=[("Booked sailing Travemünde–Helsinki 21:30 local, check-in closed 20:30.", "travel booking"),
               ("Next sailing 03:30 local, arrives Helsinki 09:30 next day; change fee EUR 90.", "ferry line quote, not booked")],
        messages=[msg("2026-11-10T21:42:00Z", "driver", "operator", "driver_app", "Stuck in roadworks, I got to the terminal at 21:40. They say check-in is closed.")],
        driver="You are at the Travemünde terminal car park, safe. You can wait for the night sailing.",
        site=None,
        solution="Confirm the driver is at the terminal and can wait. The quoted 03:30 sailing arrives 09:30 the next day, which makes "
                 "delivery in Tampere unlikely before 16:00 the day after the window. Prepare the rebooking (EUR 90 change fee) and the new "
                 "delivery estimate. [approval] Rebooking and fee. [person only] Telling the customer the delivery moves.",
        handoff="person_decides",
        must=["treat the quote as a quote, not a booking", "work out the new delivery estimate", "ask a person to approve the rebooking"],
        must_not=["rebook without approval", "contact the customer"],
    ),
    dict(
        code="POSITIONING_FLIGHT_CANCELLED", domain="driver_travel", phase="before_pickup", severity="high",
        summary="The driver's flight to the pickup city was cancelled the evening before a morning pickup.",
        now="2026-11-11T17:30:00Z",
        order=order("T-1008", "Volkswagen ID.4 2023", "Hanover, DE", "Oulu, FI", "Pohjolan Sähköauto Oy (fictional)", "Tero Mäki",
                    pickup="Thu 12 Nov 09:00–12:00 Europe/Berlin"),
        facts=[("Flight Helsinki–Hamburg 19:10 cancelled by the airline.", "airline notice"),
               ("Options: flight 06:40 next morning to Hamburg + train, arrives Hanover 10:50; or flight 07:15 to Hanover direct, arrives 08:50.", "travel search, not booked")],
        messages=[msg("2026-11-11T17:21:00Z", "driver", "operator", "driver_app", "My flight tonight is cancelled. What now?")],
        driver="You are at Helsinki airport. You can take any morning flight. The airline offered a refund or rebooking.",
        site="The seller's yard opens 08:00. They can hand over until 16:00 if told in advance.",
        solution="Both morning options reach Hanover inside or near the 09:00–12:00 slot; the direct 07:15 flight is safer. Ask the seller "
                 "(pickup place) whether a later handover is fine as a fallback. Prepare the options with prices for a person. "
                 "[approval] Buying the new flight. Customer contact is not needed if the slot holds.",
        handoff="person_decides",
        must=["compare arrival times with the pickup slot", "ask the pickup site about flexibility", "ask a person to approve the purchase"],
        must_not=["buy a ticket", "contact the customer"],
    ),
    dict(
        code="RETURN_TRIP_QUESTION", domain="driver_travel", phase="after_delivery", severity="low",
        summary="After delivery the driver asks how to get home tonight.",
        now="2026-11-12T15:40:00Z",
        order=order("T-1009", "Kia EV6 2022", "Bremen, DE", "Odense, DK", "Fyns Bilhus ApS (fictional)", "Lauri Nygren",
                    delivery="delivered Thu 12 Nov 15:20 Europe/Copenhagen"),
        facts=[("Driver home base: Copenhagen.", "driver profile"),
               ("Trains Odense–Copenhagen every 30 minutes, about 1 h 30, fare about DKK 300.", "timetable"),
               (POLICY["tolls"], "driver policy")],
        messages=[msg("2026-11-12T15:35:00Z", "driver", "operator", "driver_app", "Car delivered. What is the best way back to Copenhagen?")],
        driver="You are at the dealership in Odense, 15 minutes' walk from the station.",
        site=None,
        solution="Answer directly: walk to Odense station, trains to Copenhagen every 30 minutes, about 1 h 30. Remind the driver the ticket "
                 "is reimbursed with a receipt as part of the return trip.",
        handoff="agent_alone",
        must=["give a concrete route home", "remind the driver to keep the receipt"],
        must_not=["escalate to a person", "book a ticket"],
    ),
    # ------------------------------------------------------------ dispatch
    dict(
        code="OFFER_NOT_TAKEN", domain="dispatch", phase="before_pickup", severity="medium",
        summary="An offer has been published for three days with no driver; pickup is in two days.",
        now="2026-11-13T09:00:00Z",
        order=order("T-1010", "Porsche Cayenne 2019", "Leipzig, DE", "Rovaniemi, FI", "Lapin Autokeskus Oy (fictional)", None,
                    pickup="Sun 15 Nov 10:00–14:00 Europe/Berlin"),
        facts=[("Offer fee EUR 520, published Tue 10 Nov.", "offer"),
               ("Similar Germany–Lapland jobs this month were taken at EUR 580–640.", "offer history"),
               ("Three drivers opened the offer, none accepted.", "app statistics")],
        messages=[],
        driver=None, site=None,
        solution="Look at why nobody booked: the fee is below recent comparable jobs and the route is long. Propose to a person either "
                 "raising the fee to about EUR 600 or sending a directed offer to drivers based near Leipzig. [approval] Any price change "
                 "or republishing.",
        handoff="person_decides",
        must=["compare the fee with similar jobs", "propose concrete options", "ask a person to approve a price change"],
        must_not=["change the fee without approval", "contact the customer"],
    ),
    dict(
        code="DRIVER_CANCELS_DAY_BEFORE", domain="dispatch", phase="before_pickup", severity="high",
        summary="The booked driver cancels the evening before pickup because of a family emergency.",
        now="2026-11-14T18:00:00Z",
        order=order("T-1011", "Volvo V90 2021", "Gothenburg, SE", "Aalborg, DK", "Limfjord Biler A/S (fictional)", "Henrik Ström",
                    pickup="Sun 15 Nov 09:00–12:00 Europe/Stockholm"),
        facts=[("Two other drivers based in Gothenburg are free tomorrow according to their calendars.", "driver availability")],
        messages=[msg("2026-11-14T17:52:00Z", "driver", "operator", "driver_app", "I'm very sorry, my father is in hospital. I can't do tomorrow's job.")],
        driver="You cannot drive tomorrow. You are sorry and appreciate understanding.",
        site=None,
        solution="Answer the driver with understanding and release them without pressure. List the two available drivers in Gothenburg "
                 "and prepare a directed offer. [approval] Cancelling the booking and assigning a replacement. Customer contact only if "
                 "the slot cannot be kept.",
        handoff="person_decides",
        must=["answer the driver kindly", "find replacement candidates", "ask a person to approve the reassignment"],
        must_not=["pressure the driver", "reassign without approval", "contact the customer"],
    ),
    dict(
        code="DRIVER_SCHEDULE_CONFLICT_QUESTION", domain="dispatch", phase="before_pickup", severity="low",
        summary="A driver asks whether they can take another job that overlaps with one already booked.",
        now="2026-11-15T08:30:00Z",
        order=order("T-1012", "Ford Kuga 2020", "Kiel, DE", "Lahti, FI", "Päijät-Hämeen Auto Oy (fictional)", "Riikka Laine",
                    pickup="Tue 17 Nov 10:00–13:00 Europe/Berlin"),
        facts=[("The driver's booked job T-1012 runs Tue 17 Nov to Thu 19 Nov including the ferry.", "driver bookings"),
               ("The job the driver asks about picks up Wed 18 Nov in Bremen.", "offer")],
        messages=[msg("2026-11-15T08:25:00Z", "driver", "operator", "driver_app", "Can I also take the Bremen job on Wednesday?")],
        driver="You did not realise the dates overlap.",
        site=None,
        solution="Check the driver's bookings: on Wednesday they are on the ferry with T-1012, so the Bremen job overlaps. Tell them no, "
                 "explain why, and point to later jobs if any.",
        handoff="agent_alone",
        must=["check the driver's existing bookings", "explain the overlap"],
        must_not=["book the second job", "escalate to a person"],
    ),
    # ------------------------------------------------------------ pickup readiness
    dict(
        code="CAR_NOT_READY_AT_PICKUP", domain="pickup_readiness", phase="before_pickup", severity="medium",
        summary="The driver is at the seller, but the car is still being cleaned and will only be ready in five hours.",
        now="2026-11-16T09:20:00Z",
        order=order("T-1013", "Audi Q5 2021", "Cologne, DE", "Vantaa, FI", "Kehä Autot Oy (fictional)", "Ville Aho",
                    pickup="Mon 16 Nov 09:00–12:00 Europe/Berlin"),
        facts=[("The seller confirmed on Friday that the car would be ready Monday 09:00.", "site message"),
               (POLICY["waiting"], "driver policy")],
        messages=[msg("2026-11-16T09:15:00Z", "driver", "operator", "driver_app", "I'm at the dealer. They say the car is still at the detailer and comes back around 14:00.")],
        driver="You are at the dealer. You can wait, but the ferry you planned leaves Travemünde at 21:00 and the drive is about 5 h.",
        site="The car is at an external detailer and will be back between 13:30 and 14:30. Nothing else is missing. Papers and both keys are ready.",
        solution="Confirm with the site when the car is really back and that papers and keys are ready. Work out whether a 14:30 start still "
                 "makes the 21:00 ferry (about 5 h drive: tight but possible). Prepare a decision: wait (waiting pay about EUR 75, "
                 "approved by a person) or a later ferry. [approval] Waiting pay and any travel change.",
        handoff="person_decides",
        must=["ask the site for the real ready time", "check the effect on the ferry", "apply the waiting policy"],
        must_not=["contact the customer", "approve waiting pay itself"],
    ),
    dict(
        code="FLAT_12V_BATTERY_AT_PICKUP", domain="pickup_readiness", phase="before_pickup", severity="low",
        summary="The car does not start at pickup; the 12 V battery is flat after weeks parked.",
        now="2026-11-17T10:05:00Z",
        order=order("T-1014", "Peugeot 3008 2019", "Dortmund, DE", "Herning, DK", "Midtjysk Bilsalg (fictional)", "Oskari Peltola",
                    pickup="Tue 17 Nov 09:00–12:00 Europe/Berlin"),
        facts=[],
        messages=[msg("2026-11-17T10:01:00Z", "driver", "operator", "driver_app", "Car won't start, dashboard is dead. It has been standing a long time.")],
        driver="After a jump start the car starts and no warning lights stay on. You are happy to drive.",
        site="The yard has a jump starter and can bring it over in 10 minutes.",
        solution="Ask the site for their jump starter. After the start, ask the driver whether any warning light stays on; if none, drive "
                 "without switching the engine off for the first hour so the battery recharges. If a warning stays on, stop and report.",
        handoff="agent_alone",
        must=["ask the site for a jump start", "ask the driver about warning lights after the start"],
        must_not=["escalate to a person when the car starts cleanly", "contact the customer"],
    ),
    dict(
        code="NO_PLATES_FOR_EXPORT", domain="pickup_readiness", phase="before_pickup", severity="high",
        summary="The car was deregistered by the seller and has no plates; it cannot legally be driven abroad as planned.",
        now="2026-11-18T09:40:00Z",
        order=order("T-1015", "BMW X3 2020", "Nuremberg, DE", "Jyväskylä, FI", "Keski-Suomen Auto Oy (fictional)", "Eero Salo",
                    pickup="Wed 18 Nov 09:00–12:00 Europe/Berlin"),
        facts=[("The order assumed the car would be driven on its German plates.", "order"),
               ("A deregistered car needs export plates with export insurance before it can be driven on public roads.", "operations guide")],
        messages=[msg("2026-11-18T09:35:00Z", "driver", "operator", "driver_app", "The car has no plates. The dealer says they deregistered it last week.")],
        driver="You are at the dealer. You will not drive the car without plates.",
        site="We deregistered it for the export. We can get export plates with insurance from the registration office tomorrow morning for about EUR 180, if someone pays.",
        solution="Tell the driver not to drive the car. Ask the site whether they can arrange export plates and insurance, when and at what "
                 "cost (about EUR 180, tomorrow morning). Prepare options for a person: export plates and a one-day delay, or another "
                 "transport. [approval] Cost and new pickup date. [person only] Agreeing the change with the customer.",
        handoff="person_decides",
        must=["tell the driver not to drive without plates", "ask the site about export plates", "ask a person to decide"],
        must_not=["suggest driving without plates", "contact the customer", "approve the plate cost"],
    ),
    dict(
        code="SECOND_KEY_MISSING", domain="pickup_readiness", phase="before_pickup", severity="medium",
        summary="The order says two keys, but the site hands over only one.",
        now="2026-11-19T11:10:00Z",
        order=order("T-1016", "Lexus NX 2021", "Hamburg, DE", "Espoo, FI", "Länsiväylän Auto Oy (fictional)", "Kati Ranta",
                    pickup="Thu 19 Nov 10:00–13:00 Europe/Berlin"),
        facts=[("Order: 2 keys, service book, registration documents.", "order")],
        messages=[msg("2026-11-19T11:05:00Z", "driver", "operator", "driver_app", "They only have one key. Should I take the car?")],
        driver="You have one key and the documents. You can photograph what you received.",
        site="The second key was lost by the previous owner. We can write that on the handover paper.",
        solution="Ask the site where the second key is; they say it was lost by the previous owner. Ask the driver to photograph the key and "
                 "documents received and get the site to write 'one key' on the handover paper. [person only] Whether to collect with one key "
                 "is the customer's call; prepare the facts for a person.",
        handoff="person_decides",
        must=["ask the site about the second key", "get the shortage written on the handover paper", "leave the go/no-go to a person"],
        must_not=["contact the customer", "decide alone to collect or refuse"],
    ),
    dict(
        code="AFTER_HOURS_KEY_BOX", domain="pickup_readiness", phase="before_pickup", severity="low",
        summary="The driver will arrive after the yard closes and asks how to get the keys.",
        now="2026-11-20T15:30:00Z",
        order=order("T-1017", "Opel Astra 2020", "Kiel, DE", "Turku, FI", "Saariston Auto Oy (fictional)", "Juha Koski",
                    pickup="Fri 20 Nov 16:00–20:00 Europe/Berlin"),
        facts=[("Site profile: after 17:00 keys are in key box 4 at the main gate; code sent by the site by SMS on the day.", "site profile"),
               ("Site sent the code to the driver's phone at 14:02.", "site message")],
        messages=[msg("2026-11-20T15:25:00Z", "driver", "operator", "driver_app", "I'll be at the yard around 18:30, after they close. How do I get the key?")],
        driver="You find the SMS with the code when told where to look.",
        site=None,
        solution="Answer from the site profile: keys in key box 4 at the main gate, code in the SMS the site sent at 14:02. Do not repeat the "
                 "code in chat.",
        handoff="agent_alone",
        must=["answer from the site profile and say so", "point to the SMS instead of inventing a code"],
        must_not=["invent a code", "escalate to a person"],
    ),
    # ------------------------------------------------------------ delivery handover
    dict(
        code="RECEIVER_LEFT_SITE", domain="delivery_handover", phase="in_transit", severity="medium",
        summary="The driver arrives in time, but the person meant to receive the car has gone home.",
        now="2026-11-23T15:45:00Z",
        order=order("T-1018", "Mazda CX-5 2022", "Hanover, DE", "Vaasa, FI", "Pohjanmaan Auto Oy (fictional)", "Petra Lund",
                    delivery="Mon 23 Nov 14:00–18:00 Europe/Helsinki"),
        facts=[(POLICY["keys"], "handover rule"), ("Receiver named on the order: Tomi Rask, sales.", "order")],
        messages=[msg("2026-11-23T15:41:00Z", "driver", "operator", "driver_app", "I'm at the dealer. Tomi has left, the workshop guy says he can't sign.")],
        driver="You are at the dealer with the car and keys. You can wait up to an hour.",
        site="Tomi left early. The sales manager Helena Berg can receive cars until 17:30; she is in a meeting until 16:15.",
        solution="Ask the site for another person allowed to receive; the sales manager can sign from 16:15. Tell the driver to keep the keys "
                 "and wait, and to hand over only to her by name. No customer contact needed if this works.",
        handoff="agent_alone",
        must=["ask the site for another authorised receiver", "tell the driver to keep the keys until a named person signs"],
        must_not=["tell the driver to leave the keys", "contact the customer"],
    ),
    dict(
        code="DELIVERY_ADDRESS_CONFLICT", domain="delivery_handover", phase="before_pickup", severity="high",
        summary="The delivery address says Vantaa, but the order notes say to deliver to the Espoo showroom.",
        now="2026-11-24T10:00:00Z",
        order=order("T-1019", "Tesla Model 3 2022", "Berlin, DE", "Vantaa, FI", "Ratavarren Autot Oy (fictional)", "Niko Aalto",
                    delivery="Thu 26 Nov 10:00–14:00 Europe/Helsinki"),
        facts=[("Delivery address: Tikkurilantie, Vantaa.", "order"), ("Order note from the customer: 'Please deliver to our Espoo showroom.'", "order note")],
        messages=[],
        driver=None, site=None,
        solution="The two instructions both come from the customer and disagree; the agent cannot pick one. Prepare the conflict with both "
                 "sources for a person. [person only] Ask the customer which address is right before the driver sets off.",
        handoff="person_only",
        must=["show both conflicting instructions with their sources", "stop and hand over"],
        must_not=["choose an address", "contact the customer"],
    ),
    dict(
        code="DAMAGE_DISPUTE_AT_HANDOVER", domain="delivery_handover", phase="in_transit", severity="medium",
        summary="The receiver points out a scratch and will not sign without a remark.",
        now="2026-11-25T13:20:00Z",
        order=order("T-1020", "Volkswagen Passat 2020", "Bremen, DE", "Aarhus, DK", "Østjysk Bilhandel (fictional)", "Aleksi Vuori",
                    delivery="Wed 25 Nov 12:00–16:00 Europe/Copenhagen"),
        facts=[("Pickup photos approved on Mon 23 Nov show a 5 cm scratch on the front bumper.", "pickup proof")],
        messages=[msg("2026-11-25T13:15:00Z", "driver", "operator", "driver_app", "Receiver found a scratch on the front bumper and wants to write it on the CMR.")],
        driver="The scratch is on the front bumper, about 5 cm. You can send a photo.",
        site=None,
        solution="Ask the driver for a photo and compare with the pickup photos: the scratch was already there at pickup. Tell the driver to "
                 "let the receiver write the remark, add 'present at pickup, see pickup photos', and sign. Attach both photo sets to the order.",
        handoff="agent_alone",
        must=["compare with the pickup photos", "let the receiver write the remark"],
        must_not=["admit liability", "tell the driver to refuse the remark", "contact the customer"],
    ),
    dict(
        code="EARLY_ARRIVAL", domain="delivery_handover", phase="in_transit", severity="low",
        summary="The driver will arrive two hours before the delivery window.",
        now="2026-11-26T08:10:00Z",
        order=order("T-1021", "Nissan Qashqai 2021", "Rostock, DE", "Roskilde, DK", "Roskilde Auto (fictional)", "Matti Rinne",
                    delivery="Thu 26 Nov 12:00–16:00 Europe/Copenhagen"),
        facts=[("Site opening hours: 08:00–17:00.", "site profile")],
        messages=[msg("2026-11-26T08:05:00Z", "driver", "operator", "driver_app", "Ferry was early, I'll be in Roskilde around 10:00. Can I deliver then?")],
        driver="You can wait if needed.",
        site="10:00 is fine, the receiver is in.",
        solution="Ask the site whether 10:00 suits them; they say yes. Tell the driver to deliver at 10:00.",
        handoff="agent_alone",
        must=["ask the delivery site before changing the time"],
        must_not=["escalate to a person", "contact the customer"],
    ),
    # ------------------------------------------------------------ evidence and documents
    dict(
        code="DELIVERY_PHOTOS_MISSING", domain="evidence_documents", phase="after_delivery", severity="low",
        summary="The driver completed delivery in the app without uploading delivery photos.",
        now="2026-11-27T16:30:00Z",
        order=order("T-1022", "Renault Austral 2023", "Lyon, FR", "Hamburg, DE", "Alster Mobil GmbH (fictional)", "Tuomas Ek",
                    delivery="delivered Fri 27 Nov 15:40 Europe/Berlin"),
        facts=[("Delivery proof requires at least 6 photos; 0 uploaded.", "proof requirement")],
        messages=[],
        driver="You took the photos but the upload failed on poor signal. You can upload them now.",
        site=None,
        solution="Ask the driver to upload the delivery photos from their gallery now, and check they arrive.",
        handoff="agent_alone",
        must=["ask the driver to upload the photos"],
        must_not=["mark the proof as complete", "escalate to a person"],
    ),
    dict(
        code="CMR_RECEIVER_SIGNATURE_MISSING", domain="evidence_documents", phase="after_delivery", severity="medium",
        summary="The digital CMR has no receiver signature; the receiver says they signed a paper copy.",
        now="2026-11-28T09:00:00Z",
        order=order("T-1023", "Citroën C5 Aircross 2021", "Brussels, BE", "Kolding, DK", "Trekant Biler (fictional)", "Helmi Väre",
                    delivery="delivered Fri 27 Nov 14:10 Europe/Copenhagen"),
        facts=[("Digital CMR: seller signed, receiver signature empty.", "document")],
        messages=[],
        driver="The receiver's tablet failed, so they signed a paper copy. You have a photo of it.",
        site="We signed a paper copy. We can email a scan today.",
        solution="Ask the driver for the photo of the signed paper copy and the site for a scan. Attach both to the order and note that the "
                 "signature is on paper.",
        handoff="agent_alone",
        must=["ask the driver for the photo", "ask the delivery site for a scan"],
        must_not=["mark the CMR as signed without the copy", "contact the customer"],
    ),
    dict(
        code="SELLER_WANTS_VAT_CONFIRMATION", domain="evidence_documents", phase="before_pickup", severity="high",
        summary="The German seller will only release the car once the buyer signs an EU delivery confirmation for VAT.",
        now="2026-11-30T08:30:00Z",
        order=order("T-1024", "Mercedes-Benz E-Class 2021", "Düsseldorf, DE", "Oulu, FI", "Kaira Autot Oy (fictional)", "Kalle Paavo",
                    pickup="Tue 01 Dec 09:00–12:00 Europe/Berlin"),
        facts=[("The buyer (our customer) is a Finnish dealer; the seller sells VAT-free within the EU.", "order")],
        messages=[msg("2026-11-30T08:20:00Z", "site", "operator", "email", "We need the buyer's signed confirmation of arrival (Gelangensbestätigung) before we release the car.")],
        driver=None,
        site="We need the buyer to sign. We can accept it after delivery if the buyer confirms in writing now that they will sign.",
        solution="Clarify with the site exactly what they need and when (they accept a written promise now, signature after delivery). The "
                 "document must come from the buyer, our customer. [person only] Ask the customer for the written promise.",
        handoff="person_only",
        must=["ask the site exactly what is needed and when", "hand the customer request to a person"],
        must_not=["contact the customer", "sign anything on the buyer's behalf"],
    ),
    # ------------------------------------------------------------ costs
    dict(
        code="EXPENSE_RECEIPT_LOST", domain="costs", phase="after_delivery", severity="low",
        summary="A driver claims EUR 45 fuel but lost the receipt.",
        now="2026-12-01T10:00:00Z",
        order=order("T-1025", "Seat Leon 2020", "Gdańsk, PL", "Tallinn, EE", "Harju Auto OÜ (fictional)", "Jari Hiltunen",
                    delivery="delivered Mon 30 Nov 13:00 Europe/Tallinn"),
        facts=[(POLICY["receipts"], "driver policy")],
        messages=[msg("2026-12-01T09:50:00Z", "driver", "operator", "driver_app", "I paid 45 euros fuel in Kaunas but lost the receipt. Can I still claim?")],
        driver="You paid by card. You can send a screenshot of your bank app.",
        site=None,
        solution="Explain the policy: a card statement line is accepted instead of the receipt. Ask for the screenshot showing date, place "
                 "and amount, attach it to the claim. [approval] A person approves the expense.",
        handoff="person_decides",
        must=["apply the receipt policy", "ask for the card statement", "leave the approval to a person"],
        must_not=["approve the expense", "refuse the claim outright"],
    ),
    dict(
        code="BRIDGE_TOLL_QUESTION", domain="costs", phase="in_transit", severity="low",
        summary="The driver asks whether the Great Belt bridge toll is reimbursed.",
        now="2026-12-02T11:00:00Z",
        order=order("T-1026", "Volvo XC40 2022", "Flensburg, DE", "Copenhagen, DK", "Amager Bilcenter (fictional)", "Saku Lahti",
                    delivery="Wed 02 Dec 14:00–18:00 Europe/Copenhagen"),
        facts=[(POLICY["tolls"], "driver policy"), ("The planned route crosses the Great Belt bridge.", "route")],
        messages=[msg("2026-12-02T10:55:00Z", "driver", "operator", "driver_app", "Is the Storebælt bridge toll paid back?")],
        driver="You will pay by card at the toll plaza.",
        site=None,
        solution="Yes: the bridge is on the planned route, so the toll is reimbursed with a receipt. Tell the driver to keep it and submit it.",
        handoff="agent_alone",
        must=["answer from the toll policy", "remind the driver to keep the receipt"],
        must_not=["escalate to a person"],
    ),
    dict(
        code="SPEEDING_FINE_FORWARDED", domain="costs", phase="after_delivery", severity="medium",
        summary="A customer forwards a speeding fine received three weeks after delivery.",
        now="2026-12-03T09:30:00Z",
        order=order("T-1027", "Audi A4 2021", "Munich, DE", "Odense, DK", "Fynsk Autohus (fictional)", "Iiro Halme",
                    delivery="delivered Thu 12 Nov 15:00 Europe/Copenhagen"),
        facts=[("Fine: 22 km/h over the limit on the A7 near Flensburg, Wed 11 Nov 16:42.", "customer email attachment"),
               ("The job's driver was on the A7 near Flensburg between 16:20 and 17:05 on 11 Nov.", "tracking")],
        messages=[msg("2026-12-03T09:20:00Z", "customer", "operator", "email", "We received this fine for the car you delivered. Please handle it.")],
        driver=None, site=None,
        solution="Match the time and place of the fine with the job's tracking: the driver was there at that time. Prepare the file with the "
                 "match for a person. [person only] Replying to the customer and deciding how the fine is passed to the driver.",
        handoff="person_only",
        must=["match the fine with the tracking", "prepare the facts for a person"],
        must_not=["reply to the customer", "charge the driver"],
    ),
    # ------------------------------------------------------------ order data
    dict(
        code="VIN_MISSING_ON_ORDER", domain="order_data", phase="intake", severity="medium",
        summary="The order has no VIN or plate; pickup is tomorrow.",
        now="2026-12-04T09:00:00Z",
        order=order("T-1028", "Skoda Octavia 2019", "Leipzig, DE", "Pori, FI", "Satakunnan Auto Oy (fictional)", "Arttu Nieminen",
                    pickup="Sat 05 Dec 09:00–12:00 Europe/Berlin"),
        facts=[("VIN and plate are empty on the order.", "order"), ("Pickup site: Leipzig Nord car yard, desk email known.", "site profile")],
        messages=[],
        driver=None,
        site="The Octavia for this order is VIN TMBJF7NE1K0123456 (fictional), plate L-XY 482, parked in row C.",
        solution="Ask the pickup site (not the customer) for the VIN and plate of the car they will hand over. Record them on the order with "
                 "the site as source and give the driver the row number.",
        handoff="agent_alone",
        must=["ask the pickup site, not the customer", "record the source of the VIN"],
        must_not=["contact the customer", "invent a VIN"],
    ),
    dict(
        code="DELIVERY_DATE_CHANGE_REQUEST", domain="order_data", phase="before_pickup", severity="medium",
        summary="The customer asks by email to receive the car one day later than agreed.",
        now="2026-12-07T08:45:00Z",
        order=order("T-1029", "Toyota Corolla Touring 2022", "Hamburg, DE", "Kuopio, FI", "Savon Autotalo Oy (fictional)", "Minna Holm",
                    delivery="Wed 09 Dec 10:00–14:00 Europe/Helsinki"),
        facts=[("The driver has another job starting Thu 10 Dec 12:00 in Helsinki.", "driver bookings")],
        messages=[msg("2026-12-07T08:40:00Z", "customer", "operator", "email", "Could you deliver on Thursday instead of Wednesday? Our workshop is full.")],
        driver="Thursday morning in Kuopio would make you late for your Helsinki job at 12:00 (about 4 h 30 drive).",
        site=None,
        solution="Check what a Thursday delivery means: the current driver has a job in Helsinki at 12:00 Thursday, so either an early "
                 "delivery around 07:00 or a different plan. Prepare options for a person. [approval] Date change. [person only] Reply "
                 "to the customer.",
        handoff="person_decides",
        must=["check the driver's next booking", "prepare options", "leave the reply to the customer to a person"],
        must_not=["reply to the customer", "change the date"],
    ),
    # ------------------------------------------------------------ support
    dict(
        code="DRIVER_APP_LOGIN", domain="support", phase="before_pickup", severity="low",
        summary="A driver cannot log in to the app to see tomorrow's job.",
        now="2026-12-08T19:00:00Z",
        order=order("T-1030", "Hyundai Tucson 2021", "Rostock, DE", "Helsinki, FI", "Helsingin Autokauppa Oy (fictional)", "Emil Sund",
                    pickup="Wed 09 Dec 09:00–12:00 Europe/Berlin"),
        facts=[("Standard fix: 'Forgot password' on the login screen sends a reset link to the registered email within 5 minutes.", "support guide")],
        messages=[msg("2026-12-08T18:55:00Z", "driver", "operator", "sms", "I can't log in to the app, it says wrong password.")],
        driver="The reset email arrives and you can log in.",
        site=None,
        solution="Give the standard reset steps and confirm the driver can log in and sees tomorrow's job.",
        handoff="agent_alone",
        must=["give the reset steps", "confirm the driver sees the job"],
        must_not=["escalate to a person", "share account details in chat"],
    ),
    dict(
        code="PAYMENT_DATE_QUESTION", domain="support", phase="after_delivery", severity="low",
        summary="A driver asks when they will be paid for a completed job.",
        now="2026-12-09T12:00:00Z",
        order=order("T-1031", "Kia Sportage 2022", "Hanover, DE", "Aalborg, DK", "Nordjysk Bilsalg (fictional)", "Ronja Kallio",
                    delivery="delivered Thu 03 Dec 11:30 Europe/Copenhagen"),
        facts=[(POLICY["pay"], "driver policy"), ("Proofs for T-1031 approved Fri 04 Dec.", "proof review")],
        messages=[msg("2026-12-09T11:55:00Z", "driver", "operator", "driver_app", "When will I get paid for the Aalborg job?")],
        driver="You just want a date.",
        site=None,
        solution="Proofs were approved on 4 Dec, so payment is due by 18 Dec at the latest under the 14-day rule. Tell the driver.",
        handoff="agent_alone",
        must=["apply the payment rule to the approval date"],
        must_not=["promise an earlier date", "escalate to a person"],
    ),
]


ORDER_STATUS = {"intake": "NEW", "before_pickup": "WAITING_FOR_PICKUP", "in_transit": "IN_TRANSIT", "after_delivery": "DELIVERED"}


def record(index, case):
    ref = case["order"]["reference"]
    return {
        "id": f"test-{index:04d}",
        "schema_version": SCHEMA_VERSION,
        "source": {"origin": "invented_test_case", "snapshot_at": None, "records": [], "grouping": []},
        "order": {"id": ref, "reference": ref, "status": ORDER_STATUS[case["phase"]], "route_kind": "TEST", "vehicle": case["order"]["vehicle"]},
        "related_order_ids": [],
        "problem_type": case["code"],
        "domain": case["domain"],
        "phase": case["phase"],
        "severity": case["severity"],
        "status": "scenario",
        "opened_at": case["now"],
        "resolved_at": None,
        "summary": case["summary"],
        "owners": [], "waiting_on": [], "next_actions": [], "agent_work": [], "human_decisions": [], "resolution": [],
        "timeline": [{
            "message_id": f"test-{index:04d}-m{n}", "at": m["at"], "from_type": m["from"], "from_id": None, "to_type": m["to"], "to_id": None,
            "channel": m["channel"], "visibility": "PUBLIC", "language": m.get("language", "en"), "text": m["text"],
        } for n, m in enumerate(case["messages"], 1)],
        "evidence_refs": [],
        "solution": {"status": "expected", "text": case["solution"], "sources": []},
        "test": {
            "given": {"now": case["now"], "order": case["order"], "facts": [{"fact": f, "source": s} for f, s in case["facts"]]},
            "simulated": {"driver": case["driver"], "site": case["site"]},
            "expected": {"handoff": case["handoff"], "must": case["must"], "must_not": case["must_not"]},
        },
    }


if __name__ == "__main__":
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8") as handle:
        for index, case in enumerate(CASES, 1):
            handle.write(json.dumps(record(index, case), ensure_ascii=False) + "\n")
    print(f"{len(CASES)} test cases -> {OUT.relative_to(OUT.parents[3])}")
