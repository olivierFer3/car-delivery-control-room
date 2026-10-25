# Iteration 6: live external context for the agent

## Logo
The header and favicon use the unmodified `https://www.bahnexpress.fi/logo.png` (512 × 512 RGBA PNG, 11 225 bytes, sha256 `b9006c73…81ea1`) saved as `starter/public/bahn-logo.png` and `starter/app/icon.png`. No SVG or text approximation remains.

## Two new agent tools
Both are optional steps in the existing loop. Neither can create a proposal, change a booking or contact anyone; proposals still require the deterministic cutoff and option checks plus exact-version human approval.

| Tool | Data | Real or simulated | Key / cost |
| --- | --- | --- | --- |
| `check_external_conditions` | Weather forecast (Open-Meteo), Autobahn warnings/closures within 40 km on 12 main corridors (autobahn.de), Finnish road announcements and passenger-train cancellations/delays (Digitraffic), recent strike/demonstration headlines (GDELT) | **Real**, observed at call time | None, free public APIs |
| `track_flight {callsign}` | Aircraft position from ADS-B (OpenSky, anonymous) | **Real** | None |

Everything else stays simulated: driver replies, ferry and other quotes, bookings, execution and the incident clock (2026-10-21). The tool locations come from the order's pickup and delivery city, never from the model. Each source is stored as evidence labelled `Live data · real, not simulated · <source> · <real time>`, and a source that fails is recorded as unavailable and not interpreted. The model prompt says live data is context only and never replaces driver evidence or the cutoff check.

Not covered: ferry timetables and ferry tracking (the dataset's terminals and carriers are fictional), real flight schedules (dataset flights are fictional and have no callsigns), German train delays (no reliable free API found; the community DB endpoint returned 503), roads outside Germany and Finland. ElevenLabs voice is unchanged from iteration 5.

## What was verified
- `npm run test:external` (fake `fetch`): parsing, attribution, thresholds, failure handling, once-per-incident reuse. These do not prove the real services work.
- A direct call against the real services on 2026-10-25 returned weather, Autobahn, Finnish road, Helsinki train and OpenSky data. GDELT timed out or returned 429 every time and was reported as unavailable. It is unreliable.
- A scripted chooser (not a language model) drove the real engine and database with the real services for CD-420603, which persisted a proposal awaiting approval with live evidence shown in the incident page on desktop and mobile.
- **No real language-model investigation was run:** no authorized model key was available.
