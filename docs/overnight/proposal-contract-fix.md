# Proposal contract correction

The failed live Gemini delay incident is `3a1f3a91-4eb9-4461-8a50-1cf935c4720e`. Its sixth counted provider response selected:

```json
{"tool":"create_proposal","args":{"reason":"","optionId":"sim-ferry-603-1","contradictions":[]}}
```

The engine requires optionId, reservationId, summary, consequences and evidenceIds, rejects other keys, and validates current evidence, booking feasibility, proposal versions and approval independently. The provider schema was a generic argument bag: reason and contradictions were permitted for every tool, and none of the proposal fields was required. Consequently, the captured response satisfied the provider-facing schema while violating the engine contract. The system prompt alone did not prevent it. The engine rejected it with `Unexpected tool argument`; no proposal or execution resulted. The six-request allowance prevented a successful correction during that run.

`proposal-contract.ts` now declares the shared proposal argument shape. The engine derives its allowed keys from that declaration and retains its existing required-field/type/length, evidence, feasibility and authorization validation. The provider schema has a dedicated create_proposal branch with all five fields required, no additional properties, and field bounds matching engine validation. The broader existing branch excludes create_proposal. No input fields are dropped or synthesized. Both structured-output adapters use the existing common schema; other tool behavior and provider configuration are unchanged.

Google documents anyOf and additionalProperties support for Gemini structured output: https://blog.google/innovation-and-ai/technology/developers-tools/gemini-api-structured-outputs/ . Actual acceptance and behavior of this revised schema on the configured live model remain unverified.

Verification from starter:

```sh
node --import tsx scripts/tests/overnight-proposal-contract.test.ts
node --import tsx scripts/tests/incidents.test.ts
node --import tsx scripts/tests/iteration2.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

Results: 3 new contract tests, 15 incident tests and 10 iteration-2 tests pass; zero skipped; typecheck and git diff --check pass. The schema regression failed against the original provider schema before the fix. Tests intercept fetch and inspect the actual outgoing Gemini schema; no network request occurs. Captured invalid arguments are preserved exactly and rejected by the engine. Valid evidence-backed arguments produce one proposal requiring human approval, and missing/extra fields still fail.

Runner state and limits were read only during this fix: blocked, no controller/worker/app; cycles 3; elapsed 219.69; coding sessions 1; recorded tokens 749646; provider calls 6; live runs 1. Two live runs and twelve requests remain, six per run. No remaining allowance was consumed and no iteration completion changed.

The patch is ready for an explicitly authorized targeted delay recheck, but is not live-verified. The default second live_gate run schedules disproved, so it would not exercise this proposal fix. A future targeted validation must retain persistent request/run accounting and explicitly select delay. New file hashes also require reconciliation before the overnight runner could resume. The runner remains stopped; these edits do not authorize a resume or bypass the coding ceiling.
