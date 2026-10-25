# Driver Support: real phone calls with ElevenLabs and Twilio

Status of this branch: the whole workflow works **now in test mode** (real Groq investigation, real live weather/road/train data, live operator dashboard, approval cycle). **Real phone calls are implemented but switched off** until you add credentials and explicitly authorize them. No call has been placed and nothing has been purchased.

## What the workflow does

1. On a phone, open the Driver Support page (link shown in the Control Room, workspace page). Pick one of the six synthetic orders that have a booked ferry, describe the problem, press **Report incident**.
2. The incident appears in the operator's Control Room within about 3 seconds (workspace queue, "Driver report from ...").
3. The **real Groq agent** starts by itself: reads the order, asks the driver for ETA and safety, checks live weather, roads and trains (REAL data), checks the booked ferry against the driver's ETA and fictional alternative sailings (SIMULATED), and prepares a proposal.
4. When the agent asks its question the driver can **answer by text** or press **Call me**:
   * **Live mode** (credentials + authorization present): ElevenLabs places a real call through your Twilio number to your own test number. You talk to the ElevenLabs voice agent. The transcript streams into both dashboards while the call runs. When the call ends, the Groq model reads the transcript into the structured reply (minutes to the terminal, safe or not, blockers); the investigation agent gets it as evidence and continues.
   * **Test mode** (default): a clearly labelled *SIMULATED CALL*. No phone network. The person types what they would say; the same transcript, extraction and agent path runs.
5. The operator sees the incident, the conversation (each line labelled LIVE PHONE CALL, SIMULATED CALL or TYPED), the live agent activity (each result labelled REAL, SIMULATED or Synthetic), the evidence and the proposal, and **approves or rejects** it. After approval the operator applies the simulated change as a separate step, exactly as before.
6. The driver page shows every status change and the operator's response by itself (2 s refresh).

Who is who: the **ElevenLabs voice agent** only talks on the phone. The **Groq agent** investigates and proposes; it never executes or approves. Nothing is ever booked or bought: ferries, quotes and the driver's alternatives are fictional.

## Safety rules enforced in code

* The number that rings is `DRIVER_TEST_PHONE` on the server. The page and API cannot supply or change a number. The page only shows it masked (`+49 ••• 678`).
* Live mode needs **all** of `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `ELEVENLABS_PHONE_NUMBER_ID`, `DRIVER_TEST_PHONE` and `TELEPHONY_LIVE_ENABLED=true`. Anything missing keeps the page in test mode (unit-tested).
* A live call also needs the driver to tick "I authorize a real phone call to +49 ••• 678" on the page, at most 2 live calls per incident, one active call at a time.
* Driver text and call transcripts are untrusted data for the agent, never instructions. The driver code in the URL is derived from the operator token (HMAC) so the token itself is never shared; at most 12 incidents per hour per server.
* Orders and drivers are synthetic. Customers and other drivers are never contacted.

## Credentials and capabilities found

| Item | Status |
| --- | --- |
| Groq (investigation agent) | key and allowed model `openai/gpt-oss-120b` in `starter/.env`; used for real in the tests. Account limit observed in headers: 8,000 tokens per minute, which makes a full investigation take a few minutes; the server retries automatically. |
| ElevenLabs API key / Agent ID / phone number ID | **not configured anywhere** (empty in every worktree). Live calls could not be tested. |
| Twilio account / number | **not configured**; nothing purchased. |
| Public HTTPS URL for a phone | **not available here**; the server is a VPS behind the Matrix gateway. A tunnel was not opened (blocked and not authorized). |

ElevenLabs capabilities used (from ElevenLabs documentation, October 2026):
* Native Twilio integration: import a Twilio number in the ElevenLabs dashboard (Twilio Account SID or API key SID plus token). Outbound calling works with a purchased number, or a verified caller ID (outbound only).
* Outbound call API: `POST https://api.elevenlabs.io/v1/convai/twilio/outbound-call` with `agent_id`, `agent_phone_number_id`, `to_number`, optional `conversation_initiation_client_data.dynamic_variables`, optional `telephony_call_config.ringing_timeout_secs`. Response: `success`, `message`, `conversation_id`, `callSid`. Header `xi-api-key`.
* Conversation API: `GET https://api.elevenlabs.io/v1/convai/conversations/{conversation_id}` returns `status` (`initiated`, `in-progress`, `processing`, `done`, `failed`) and a `transcript` of `{role: user|agent, message, time_in_call_secs}`. The server polls it every 3 s while a call is open and shows each line as it appears.

## Cost (estimates, verify before you authorize)

* ElevenLabs Agents: about **USD 0.08 per call minute** on paid plans, plus the LLM used by the voice agent (fractions of a cent to a few cents per minute). Free plan minutes are limited.
* Twilio: the outbound voice minute to your country's mobile network (roughly USD 0.01 to 0.10 per minute depending on country; check Twilio's voice pricing page), plus a phone number (about USD 1 to 2 per month) if you buy one. A Twilio **trial** account can only call numbers verified in Twilio and plays a short trial message first.
* One test call of 2 minutes should cost well under USD 1 in total.
* Groq usage per investigation: about 8 to 10 short model calls plus one transcript read; this stays within the free tier but is rate-limited (8,000 tokens per minute).

## What you need to configure (one time)

1. Twilio: create an account, buy or verify one number, note Account SID and Auth Token (or an API key). For a trial account, verify your own mobile number in Twilio first.
2. ElevenLabs: Agents platform, **Phone numbers**, import the Twilio number (label, number, SID, token). Copy its **phone number ID**.
3. ElevenLabs: create an agent (conversation voice: choose a natural voice; language: your own). Use `docs/telephony/AGENT-PROMPT.md` as its system prompt and first message. Add the dynamic variables listed there. Set the maximum call duration to **120 s**. Copy the **agent ID**.
4. In `starter/.env` (never commit it):
   ```
   ELEVENLABS_API_KEY=...
   ELEVENLABS_AGENT_ID=agent_...
   ELEVENLABS_PHONE_NUMBER_ID=phnum_...
   DRIVER_TEST_PHONE=+49...            # your own number, E.164
   TELEPHONY_LIVE_ENABLED=true         # your explicit authorization to place chargeable calls
   ```
5. Restart the server. The Control Room workspace now shows `PHONE: LIVE (+49 ••• 678)`.
6. The phone must reach the page over **HTTPS** (microphones are not needed for a real call, but the page still needs a reachable URL). Use a tunnel you control, for example `cloudflared tunnel --url http://127.0.0.1:3120`, and open the printed `https://...trycloudflare.com/driver?k=...` link (copy it from the Control Room, replacing the host).

## Test it yourself

Computer: `cd starter && npm run build && npm start -- -p 3120` (with your `.env`; `DATABASE_URL` must point to a seeded database, see `README.md`). Unlock the Control Room with the operator token at `/incidents?view=workspace` and copy the **Driver Support page** link.

Phone (test mode works without any credential): open the link, choose `CD-420324`, describe a breakdown, press **Report incident**. Watch the computer: the case appears; "Live agent activity" fills in. When the page asks its question, press **Start a simulated call**, type an answer such as "about 5 hours, I am safe", **End call and send**. The agent resumes, checks live data, prepares a proposal. On the computer press **Approve version 1**, then **Apply approved simulated change**; the phone shows each step.

Live mode: after step 5 above, the same button reads **Call me now**; tick the authorization and answer the call on your phone. This is the moment that costs money; do it only when you decide to.

## Verification performed

* `npm run test:driver-phone`: telephony gating (every missing setting stays in test mode), ElevenLabs request/response mapping with a mocked network, driver access code, activity labelling, conversation sync.
* A full real-Groq run in test mode through the HTTP API: report, agent steps, question, simulated call, transcript read, proposal, operator approve, apply, driver status. Results are in `docs/verification/driver-phone/`.
* Not verified (needs your credentials/payment): a real call, ElevenLabs audio quality, microphone/phone behaviour over a tunnel.
