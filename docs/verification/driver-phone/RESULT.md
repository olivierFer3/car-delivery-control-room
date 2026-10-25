# Driver Support end-to-end result (25 Oct 2026)

Real Groq model (`openai/gpt-oss-120b`, 8,000 tokens/minute account limit), real live weather/road/train sources, disposable PostgreSQL, **telephony in TEST MODE** (no phone network, no ElevenLabs or Twilio credential exists). Script: `starter/scripts/driver-phone-e2e.py`.

Scenario, run twice (orders CD-420324 and CD-420075, driver says about 5 hours, ferry check-in closes in 3 to 4 hours):

1. Driver report created through `POST /api/driver/incidents`; incident visible to the operator immediately.
2. Groq agent: read the order, asked the driver, (after the reply) checked live weather/roads/trains (REAL, 5 to 6 sources), checked the booking against the ETA (cutoff missed), searched fictional alternatives, checked one, prepared proposal version 1.
3. Simulated call (labelled SIMULATED CALL): typed answer, transcript read by Groq into "300 min, safe, blocker: engine is dead", applied to the agent.
4. Operator approved version 1 and applied the simulated change; the driver page showed "Approved by the operator" and then "Solved: simulated booking change applied".
5. The per-minute model limit produced several HTTP 429 answers; the agent waited and retried by itself and the activity list shows them as "AI model busy".

Not verified (needs credentials/payment/your phone): a real phone call, ElevenLabs voice quality, access from a phone over an HTTPS tunnel.
