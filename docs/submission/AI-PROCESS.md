# How we worked with coding agents

Submission draft based on retained development notes and verification reports. These are concrete examples from earlier work. Claude's current integration and its tests are **not** claimed complete. No checks were rerun to write this document.

## Our approach

We gave agents a bounded workflow: investigate one synthetic incident with real model-selected tools, preserve source references, and stop before a human-only decision. Server code—not a model assertion—controls permissions, versioned approval and execution. We reviewed failures, kept history and separated mocked transport tests from real-provider runs.

The initial brief, paraphrased: inspect and preserve the existing repository; make the LLM choose its next tool; do not silently substitute mocks; require approval before changing a booking, cost or date. The later voice brief required transcript review before submitting a simulated driver reply. These are summaries of task instructions, not invented excerpts from a conversation log.

## Examples we can show the judges

| Mistake or rejected approach | What we changed | What the existing evidence supports |
| --- | --- | --- |
| Gemini returned a proposal shape with invalid/missing fields. Accepting it, or loosening the server validator, would have hidden the problem. | Aligned the provider's proposal schema with the engine's required fields. Preserved server rejection for missing/extra fields and unapproved actions. | Recorded failure, focused contract regression and subsequent scoped late-case verification. See `../overnight/proposal-contract-fix.md`, commit `a74a52b`, and `starter/scripts/tests/overnight-proposal-contract.test.ts`. |
| With a silent driver, the model repeatedly chose ask_driver rather than a stopping tool. Outreach was not repeated, but the request allowance was consumed and the case became a technical error. | Made a recorded no-response an explicit persisted waiting boundary. Kept the initial question/history; only an explicit simulated reply permits resume. | Real Gemini run 4 used six requests across waiting, process restart and late-reply resume; no-reply restart used zero new requests and no second outreach occurred. `../overnight/no-response-live-run-4.md`. |
| Treating an old successful trace as universal evidence, or demanding another live run merely because a queue moved to the next task. | Compared relevant code/configuration fingerprints and mapped each criterion to matching evidence. Reconciled iteration 3 without resetting attempts, hiding failed runs or spending another coding session on a budget block. | `../../runner/evidence/iteration3-reconciled-completion.json` records scope, unchanged counters and coverage limits. It does not prove all later code revisions are live-verified. |
| A voice-confirmation comparison stringified whole JSON objects. PostgreSQL JSONB reordered keys, so an identical retry could appear different. | Compared the specific reply fields instead; retained rejection of conflicting retries. Confirmation, driver reply and voice evidence commit atomically. | Real isolated-PostgreSQL tests with mocked providers verified concurrent identical confirmations produce one reply/evidence event. See `../voice/VERIFICATION.json` and voice-server tests. No real ElevenLabs call was involved. |
| The new voice route compared Origin only with Next's normalized Request URL, rejecting a valid local cookie-authenticated request. | Compared the incoming host/protocol correctly, added a positive normalization regression and kept foreign-origin rejection. | API tests and the later mocked browser flow passed. We did not disable authorization or remove a failing safety assertion to make the UI work. See `../CODING-AGENT-NOTES.md` and `../voice/VERIFICATION.json`. |

## Where we did not take the first answer

- We rejected silent mock fallback when real credentials/provider requests failed. An explicitly labelled fixture is useful for a test; it is not evidence of live reasoning.
- We rejected “green tests mean no bugs.” Tests establish bounded behavior; receipts record the code/scenario and what was not checked.
- We rejected reusing a past case as proof or approval for a current booking change. Every proposal version needs its own human decision.
- We deferred memory, extra routing and broad rewrites when they did not unblock the agreed operational workflow. The supplied incident collection contained no resolved incident rows; we did not fabricate history to satisfy a search gate.
- We did not solve budget blocks by repeatedly launching coding sessions. Any live allowance extension was separately authorized and recorded; previous usage and failed runs stayed visible.

## Verification categories we keep separate

**Real model verification:** historical Groq/Gemini ferry cases; real Gemini selected-order run 6 on CD-420324, with two HTTP-200 requests and model-selected context/driver tools. Its outcome was waiting, not a proposal or delivery.

**Simulated business services:** driver replies, alternative sailings and booking effects are fictional even when the supervisor model is real. No real customer contact, purchase or booking was made.

**Automated tests:** provider doubles cover error paths and deterministic regressions; PostgreSQL/browser tests also exercised persistence, review and duplicate protection. These tests do not establish provider availability or speech quality.

**Voice:** real SDK/browser setup with a fake microphone and intercepted WebSocket passed a mocked flow. Real ElevenLabs audio, account configuration and real-device latency remain unverified.

**Pending:** Claude's final integrated product revision needs its own evidence. Earlier receipts must not be relabelled as tests of that unfinished revision.

## Evidence to include, and information still missing

Use focused commit diffs, existing screenshots and sanitized receipts. Do not upload API keys, signed session URLs, cookies, private raw logs or unreviewed conversation exports. Public notes already capture failures and corrections; a raw agent transcript is not required to explain the process.

**Missing before submission:** final integrated commit and check results from Claude; the approved clips/screenshots for the video; team/narrator attribution; final repository/video links. Any performance/time-saving claim would need measurement and is intentionally absent.
