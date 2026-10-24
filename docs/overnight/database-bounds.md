# Database timeout regression

The development failure was an incident read blocked by an exclusive PostgreSQL table lock. The incident store previously configured only pool size, so PostgreSQL could wait indefinitely for that lock.

The store now sets connection establishment to 3 seconds, lock waits to 1.5 seconds, and statement execution to 3 seconds. PostgreSQL cancels the actual operation; failed transactions roll back. Approval, version, receipt, evidence and lease predicates are unchanged. These are per-connection/per-statement limits, not an end-to-end deadline covering arbitrary application callbacks or pool queueing.

Validation used a new disposable PostgreSQL 16 container bound to loopback, with no shared database or provider access. The new regression explicitly requires OVERNIGHT_TEST_DATABASE_URL; it never falls back to DATABASE_URL.

- Original store: regression failed after its 15-second subprocess watchdog because the locked product read did not terminate.
- Fixed store: locked reads, mutations and checkpoints return PostgreSQL 55P03 within 4.5 seconds each. No decision, execution or attempted mutation is committed; the pool remains usable after lock release.
- A deliberately slow update trigger exercises statement cancellation (57014) within 4.5 seconds and confirms rollback.
- Existing incidents suite: 15 passed. Existing iteration2 suite: 10 passed, including serialized waiting/reply recovery, provider failure classification, approval/version protection and duplicate execution behavior.
- TypeScript: tsc --noEmit --incremental false passed.

Run from starter:

```sh
OVERNIGHT_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55439/postgres node --import tsx scripts/tests/overnight-db-bounds.test.ts
```

The supplied database must be disposable: the test creates an incident table and a temporary slow-update trigger. This bounded change does not claim new PostgreSQL evidence for interrupted workers or concurrent receipt execution; those behaviors were not rewritten.
