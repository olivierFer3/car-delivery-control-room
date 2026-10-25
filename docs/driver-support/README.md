# Driver Support page

`/driver?k=<code>` on a phone (the link, with its code, is shown in the Control Room workspace after unlocking). Everything is synthetic: six orders with a booked ferry, fictional drivers, fictional ferries and quotes.

1. Choose an order, describe the problem, press **Report incident**. The case appears in the Control Room within about 3 seconds.
2. The real Groq agent starts at once: reads the order, asks the driver, checks live weather, roads and trains (labelled REAL), checks the booked ferry against the driver's ETA and fictional alternatives (labelled SIMULATED), then proposes one change.
3. The driver answers by text (minutes to the ferry terminal, safe or not, blockers) or with **Start a simulated call**: a clearly labelled SIMULATED call where the driver types what they would say. A Groq model reads that into the same fields, shown with the transcript. No phone network is used.
4. The operator sees the conversation, the live agent activity and the proposal, approves or rejects it, then applies the simulated change as a separate step. The driver page shows each status change by itself.

Real phone calls (ElevenLabs and Twilio) were built and then removed on purpose: the brief allows mocking the phone, and they added cost and risk without helping the judging criteria. The git history keeps the work (`7be2402`) if it is ever wanted.

Safety: the code in the link derives from the operator token (the token is never shared), at most 12 reports per hour, driver text is untrusted data for the agent, nothing is ever booked or bought.

Check: `cd starter && npm run test:driver-phone`; full real-model run in test mode: `INCIDENT_OPERATOR_TOKEN=... python3 scripts/driver-phone-e2e.py` against a running server.
