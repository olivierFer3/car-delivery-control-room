# Final submission checklist

Documentation draft only. Claude owns integration, UI and product tests; the owner owns publication/submission. No unchecked item below is claimed complete, and this checklist does not authorize tests or provider spending.

## Already recorded — retain their scope

- [x] Real Gemini selected-order waiting run recorded at the tested operational revision: two model requests, selected-order evidence, no invented reply or execution. `../verification/selected-order-run6.json`.
- [x] Earlier late-case human review/separate simulated execution and duplicate protection documented. `../overnight/final-acceptance-demo.md`.
- [x] Iteration-3 acceptance reconciled to matching existing evidence; limits/counters retained. `../../runner/evidence/iteration3-reconciled-completion.json`.
- [x] Voice's mocked-provider browser/PostgreSQL tests, typecheck/build and limitations recorded. `../voice/VERIFICATION.json`. This is not live audio verification.
- [x] Earlier independent local Git-clone setup and attachment access recorded at `d23341d`. `../verification/literal-fresh-clone.json`. This is not final-integration validation.

## Claude — final product readiness, evidence still required

- [ ] Identify and record the **final integrated branch and commit**. Recheck the newest agent/fast-eval-rules tip; the handoff's 63d14da was an inspection point, not a pin that should overwrite Claude's newer work.
- [ ] Confirm operational, evaluation and optional voice changes are integrated once; preserve unrelated dirty runner files and all existing histories. Keep the overnight runner stopped.
- [ ] Verify the normal selected-order path, unsupported human handoff, Not checked vs checked/no-action, source/timestamp visibility and incident-vs-delivery language on that final revision.
- [ ] Verify waiting/reply/restart, technical-failure recovery, questions, rejection/revision, exact-version approval, separate simulated execution and duplicate protection. Record which checks use provider doubles.
- [ ] If voice is included, verify review/confirmation/cancellation and text fallback on the final revision. Label ElevenLabs audio unverified unless a separately authorized real test has actually passed; otherwise omit any live-audio demonstration.
- [ ] Run appropriate focused regressions, typecheck/build and UI checks after integration; supply receipts. Do not substitute historical branch results for final integrated-code checks.
- [ ] Validate the **final submission commit** from a fresh checkout with isolated resources, documented environment names and attachment access. Never reseed shared development or existing populated validation data. Note remaining packaging/dependency limitations.
- [ ] Confirm keys remain server-side; missing configuration fails clearly without silent mock reasoning. Keep raw technical traces secondary in the operator UI.

No new live run is authorized here. Last recorded accounting was six runs consumed, zero remaining run slots, despite four unused global model requests. Recheck through Claude/owner before any new paid/live activity; do not alter counters or approvals to complete this list.

## Owner — content, access and submission

- [ ] Confirm the official hub/form, required fields, word limits and submission cutoff/time zone. The participant brief says Sunday 15:00; do not infer a time zone from this draft.
- [ ] Fill **[TEAM_NAME_AND_MEMBERS]**, **[FINAL_COMMIT]**, **[REPOSITORY_URL]**, **[VIDEO_URL]** and **[FINAL_README_OR_SETUP_LINK]** in HUB-DRAFT.md.
- [ ] Review all claims against the final receipts. Remove any suggestion that Claude's unfinished work, real ElevenLabs audio, successful delivery, full incident coverage or measured time savings is established without evidence.
- [ ] Select the recorded waiting example and separate historical late-case approval/execution assets. Keep explicit captions so the edit does not imply they are one continuous incident or the final integrated build.
- [ ] Rehearse VIDEO-SCRIPT.md aloud; record/edit a 2–3 minute English video with legible sources, human decision and separate action. Include concrete coding-agent mistakes and corrections.
- [ ] Check every frame, console, file and repository for credentials, cookies, short-lived signed URLs or private raw traces. Keep microphone/account settings out of the recording.
- [ ] Confirm the repository is publicly accessible to judges and contains the intended final code, README and source attachments. Do not assume a branch URL means default-branch integration is complete.
- [ ] Upload the reviewed video and test its link from a signed-out session. Publishing/uploading is owner work, not performed by these drafts.
- [ ] Submit the approved repository/video links and required hub fields; save confirmation. No submission, merge, deployment or publication has been performed as part of preparing these documents.

## Open information

**Missing:** final branch/commit; Claude's final test/build/UI results; which optional features make the cut; selected recording assets; narrator/team names; repository visibility/link target; video URL; exact hub and cutoff time zone. Resolve these explicitly rather than replacing placeholders with assumptions.
