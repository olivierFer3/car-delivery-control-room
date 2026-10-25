# Simulated driver voice

Branch `feature/simulated-driver-voice`, separate worktree `/home/matrix/home/projects/car-delivery-control-room-driver-voice`, based on `43f39bd`. The preceding operational branch was backed up to `origin/agent/overnight-validation` at `43f39bd55d631e698db4f265b7a60207a13753f5`. This feature branch has not been pushed, merged or deployed.

## Start locally without paid calls

The dedicated PostgreSQL container is `bahn-driver-voice-db`, own volume `bahn_driver_voice_pg`, loopback port 15440, database `controlroom_driver_voice`. It contains the supplied 100 orders plus clearly marked automated-test fixtures. No other database was seeded or reset. Port 3110 is separate from all other worktrees. Original runner state, usage and traces are untouched.

```sh
cd /home/matrix/home/projects/car-delivery-control-room-driver-voice/starter
npm run typecheck
npm run build
node --env-file=.env node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3110
```

Open http://127.0.0.1:3110/incidents?view=workspace and select a waiting test fixture. Unlock using the private token in this worktree's ignored `.env` (copy locally into the password field, never chat). The voice panel is next to the preserved text-reply controls. A waiting, clearly labelled test fixture is `/incidents/8fb5f8b4-3bc2-4bc3-bbe6-cfff55de7098`. Live voice is disabled, so it reports unavailable and does not call ElevenLabs. Server credentials are never returned; only a signed URL may be sent to the authorized operator when live voice is explicitly configured/enabled.

Microphone access needs localhost or HTTPS and appropriate iframe permission policy; an authenticated Matrix preview may need to open in its own window or use localhost forwarding. Do not expose the app unauthenticated publicly. Closing the app leaves database/session history intact.

## Configuration for a future authorized live test

No ElevenLabs or business-model live requests were made for this feature. General implementation approval does not extend the exhausted live-verification allowance.

Create a **private** ElevenLabs Agents agent manually, requiring signed authentication, with allowed origins restricted to your authenticated preview/localhost. Use AGENT-PROMPT.md as its system prompt, with the six named dynamic variables. First message should identify the call as simulated and ask what information is missing. Do not configure telephony, outbound calls, webhooks, client/server tools, MCP, bookings or customer contact. No tool is exposed by this client.

In the agent's Advanced/Conversation settings:

- Enable client events `user_transcript` and `agent_response`; only completed message events are used, not reasoning events.
- Set `conversation_config.conversation.max_duration_seconds` to **120**. The default is 600, so do not rely only on the client watchdog. Limit concurrency/daily usage separately in the ElevenLabs account for a single validation conversation.
- Configure voice/language appropriate to the test. The SDK version installed and typechecked is `@elevenlabs/client` **1.30.0**; signed WebSocket mode is explicit.
- Review ElevenLabs audio/transcript retention settings. This app stores text, not audio; provider-side retention is separate and has not been inspected/configured.

Private `.env`, after a specific live allowance is granted:

```dotenv
ELEVENLABS_API_KEY=your-private-key
ELEVENLABS_AGENT_ID=agent_your_private_agent
ELEVENLABS_LIVE_ENABLED=true
```

No `NEXT_PUBLIC_` API key is used. Do not commit this file. Restart the app after changing it. Production never falls back to test doubles. A signing failure records an errored session and leaves the incident waiting; a microphone rejection occurs before requesting a signed session. Signed URLs are valid for 15 minutes according to ElevenLabs; they are not persisted or logged by this app. UI sessions have a 20-second connection timeout and 120-second conversation watchdog, but only the configured provider-side duration can bound a session if a browser is frozen or disconnected.

**Smallest future live allowance:** one signed-URL API request and one browser Agents voice conversation, capped at 120 seconds, with one brief operator exchange reporting ETA, safety and blockers. Review/confirmation calls only this application's API and needs **zero** business-model requests. Do not auto-retry/reconnect or start another session after failure. To also resume the business investigation with a real model, request a separate business-run allowance: typically two model requests for an early safe reply (booking check, close), or four for a late reply (booking check, alternatives, option check, proposal). None is authorized or spent here. No exact currency estimate is claimed; use the actual ElevenLabs account's configured agent/model/voice pricing.

## Workflow and evidence

1. Open an LLM-mode incident waiting for a persisted unanswered simulated-driver question. Voice is refused for unsupported/human-only, nonwaiting, already replied, proposed, executed or actively investigated cases.
2. Start voice after microphone permission. The SDK receives incident-specific dynamic variables and a short-lived signed URL. Operator is explicitly the fictional driver.
3. Read the transcript. End normally to review, or cancel. Interruption/error never creates a driver reply. Each received text is versioned/persisted with client UTC time and server receipt time, incident/session IDs, provider conversation ID and source references. Transcripts are client-reported, not independent proof.
4. Enter/correct the UTC ETA, safety and blockers; copy/edit the driver's transcript into the reviewed reply and explicitly check the review checkbox. No automatic extraction/model call is needed. Agent-only transcripts cannot be confirmed. Ended captures can be reopened for review after reload. Active/interrupted saved captures may be explicitly cancelled; expired captures become errored when another session is requested.
5. Confirmation locks the incident and voice session in one database transaction. It calls existing receiveDriverReply, links voice evidence/timeline, and records confirmation. Concurrent identical confirmations return the same result; conflicting/stale/cross-incident attempts fail. No proposal approval or booking action occurs.
6. Resume explicitly through the existing same-incident run command. Existing approval/version/duplicate execution rules remain unchanged. Text reply is still available; if a text reply wins a race, voice confirmation is rejected rather than overwriting it.

## Verification

Client lifecycle tests use injected microphone, API and SDK doubles. Server tests use real isolated PostgreSQL and production API handlers, with local ElevenLabs/business-provider responses. They cover configuration/auth, failure/retry, cancellation, transcript immutability, stale/cross-case confirmation, concurrent duplicate confirmation, evidence, no execution and same-case resume.

```sh
cd starter
node --import tsx scripts/tests/voice-client.test.ts
# Run the real isolated-DB test without printing its private URL:
python3 - <<'PYTEST'
from pathlib import Path
import os, subprocess
values=dict(line.split('=',1) for line in Path('.env').read_text().splitlines()
            if '=' in line and not line.startswith('#'))
env=os.environ.copy();env.update(values)
env['VOICE_TEST_DATABASE_URL']=values['DATABASE_URL']
subprocess.run(['node','--import','tsx','scripts/tests/voice-server.test.ts'],env=env,check=True)
PYTEST
npm run typecheck
npm run build
```

The server integration test visibly skips without VOICE_TEST_DATABASE_URL; its recorded verification here has zero skips. Fixture helper `scripts/tests/fixtures/voice-ui.ts` also requires `VOICE_FIXTURE_ALLOWED=true` and rejects all other databases/ports. It creates labelled fixtures without making a model call; it is not normal agent reasoning.

Browser testing uses real SDK audio setup with a fake microphone, an intercepted signed-URL response/WebSocket, real cookie-authenticated transcript/confirmation endpoints and a local business-model double. No real ASR/TTS quality, provider account configuration, real microphone hardware or live latency is verified. Existing Next attachment tracing and four moderate dependency audit findings remain outside this change. Passing tests is not proof of no bugs.

## Official documentation checked

- [JavaScript SDK](https://elevenlabs.io/docs/eleven-agents/libraries/java-script)
- [Agent authentication](https://elevenlabs.io/docs/eleven-agents/customization/authentication)
- [Signed URL API](https://elevenlabs.io/docs/eleven-agents/api-reference/conversations/get-signed-url)
- [Dynamic variables](https://elevenlabs.io/docs/eleven-agents/customization/personalization/dynamic-variables)
- [Client events](https://elevenlabs.io/docs/eleven-agents/customization/events/client-events)
- [Conversation duration](https://elevenlabs.io/docs/eleven-agents/customization/conversation-flow)
