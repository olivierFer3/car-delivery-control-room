# Iteration 2 shared contract / Person A handoff

Backend reuses Incident, Proposal, Decision and Execution, plus the existing Postgres overlay. No historical proposal is imported as authorization. The Python dataset runner remains available and is not replaced.

Additive shared fields: mode (`llm` or legacy `mock`), preferredProvider (`groq` or `gemini`), driverReplies with source IDs/simulation timestamps, activeRun lease, modelTurns with public tool choices/results/provider IDs (no chain-of-thought), stopReason and lastAgentError. Existing fields retain their meaning.

New commands: run, message (read-only explanation), receive_driver_reply. Existing decide/execute/version checks remain server-owned. Model tools gain check_booking_constraints. A driver reply is an explicit fictional service event, never inferred by the model. Each model-selected tool and result checkpoints before another model decision.

Person A coordination: preserve the current detail layout, proposal cards, decision buttons, action receipts and dataset browser. Place additive controls in `live-agent-controls.tsx`, a separate component; inject it into the existing incident detail and add a small scenario launcher to the decision workspace. Only mode-specific copy and latest-reply selection need small changes in the existing detail. New controls use the existing command/action contract, scoped styles, loading/error states and OperatorAccess. No global visual redesign or existing component removal.

Acceptance: late -> checked alternative -> versioned human approval -> one simulated receipt; early/safe/no blockers -> retain booking with recorded check and evidence; silent -> persisted waiting -> explicit simulated reply -> resume without sending the same question again. Chat explains source-backed outcomes without altering approval or proposal content. Alternative starts a new proposal version, not execution.
