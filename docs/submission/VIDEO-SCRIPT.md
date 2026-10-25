# Submission video script — English draft

**Target:** 2–3 minutes. Spoken draft: approximately 330 words; rehearse aloud before recording. Editing directions and evidence notes are not spoken. Claude owns the final integration/UI: do not describe that unfinished work as shipped. Use existing recordings or saved incidents; do not trigger new model/voice calls to make the video.

## 0:00–0:25 — The operational problem

**Show:** supplied-order browser and one order's recorded ferry/source evidence. Use Claude's final UI only after Claude confirms it is ready; otherwise use the existing verified UI with its revision labelled.

**Say:**

“An alert is not a diagnosis. A driver might miss a ferry, but deciding what to do means reading messages, finding the booking, checking the cutoff and comparing alternatives.

We built a control room for that investigation. The operator can browse the supplied orders, see which ones have been checked, and open a supported ferry-risk case. Unsupported cases go to a human.”

## 0:25–1:00 — A real agent, and an honest waiting state

**Show:** recorded normal-browser case CD-420324, incident `524f86b5-f8a8-428f-a799-4d888664dfd6`. Expand the existing tool trace and source IDs; then show waiting. Caption: **Recorded Gemini run; fictional driver service.**

**Say:**

“Here is a recorded real Gemini investigation on a selected order. The model chooses to read the order context. After receiving that result, it chooses to ask the driver for an ETA, safety and blockers.

The simulated driver does not reply. The incident stays waiting. We do not invent an ETA or call the delivery safe. Sources, timestamps and completed checks remain available after reload.”

## 1:00–1:40 — Evidence, a decision, then a separate action

**Show:** cut explicitly to the earlier recorded late-arrival case `7e733c30-7952-4bc7-84f2-e38a86dd5afa`. Use the existing approval/execution recording or approved/executed screenshots. Caption: **Separate, previously verified late-arrival case — simulated booking effects.** Do not pretend it is the continuation of CD-420324. Do not recreate history by modifying an executed incident.

**Say:**

“This is a separate, previously verified late-arrival case. The proposal cites the driver report, the original reservation and a checked fictional alternative.

The operator reviews the timing, cost and uncertainty. Approval applies to one proposal version. Approval itself changes no booking: applying the simulated change is a separate step.

The receipt stays in the history, and repeated execution does not apply another change. Resolving this incident does not mean the car has been delivered.”

## 1:40–2:30 — How we used coding agents

**Show:** the proposal-contract fix, waiting-state regression and evidence receipts. Avoid private logs, keys, signed URLs and account pages.

**Say:**

“We used coding agents, but checked their work against failures. One model returned proposal fields the server could not accept. We aligned the shared schema and kept the rejection checks.

A silent-driver run also kept asking instead of stopping. We made an unanswered question a persistent waiting boundary and verified restart and resume.

We kept failed runs as evidence. Later, we matched code fingerprints to existing results rather than spending another live run on unchanged code.

Our voice extension has mocked-provider tests, not verified ElevenLabs audio. Claude's final integration still needs its own acceptance evidence.

The goal is a clear handoff: what happened, what was checked, what is missing, and exactly what the operator is approving.”

## Recording gates / optional cuts

- If over three minutes, shorten the opening and the final process explanation; keep the separate-case caption and approval/execution distinction.
- Do not show voice as a working live feature unless a later, authorized live test supplies evidence. A labelled mock clip is optional; it is not required for this script.
- Do not claim measured time savings, successful delivery, full incident-type coverage, autonomous purchasing or completed Claude integration.
- **Missing:** final integrated commit, final UI recording, narrator/team names, video URL, approved final wording. Replace only after owner/Claude confirmation.

## Evidence anchors

- Normal selected-order live waiting: `../verification/selected-order-run6.json` (two actual Gemini requests; zero proposals/decisions/executions).
- Earlier late-case browser approval and duplicate-safe execution: `../overnight/final-acceptance-demo.md`; `../verification/incident-approved.png`, `incident-executed.png` are separate historical screenshots—check the chosen assets' case/version before combining them.
- Silent-driver recovery: `../overnight/no-response-live-run-4.md`.
- Limits and voice test provenance: `../voice/VERIFICATION.json` and `../CODING-AGENT-NOTES.md`.
