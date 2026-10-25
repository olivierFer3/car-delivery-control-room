# Check of main plus the official logo, 2026-10-25

Scope: a new worktree from `origin/main` (7d70f87) with the header logo change on top, installed with `npm ci` and run against a new empty Postgres (port 15441) and object store (port 19021). Nothing shared was reseeded. No live model, ElevenLabs or paid call was made.

## Passed
- `npm run typecheck`, `npm run build`.
- Setup as the README describes: `.env` from the example, `db:push`, `db:seed` (100 orders, 4366 source records), `attachments:seed` (58), `incidents:init`.
- Tests with provider doubles: incidents 15/15, dataset 9/9, iteration2 10/10, operational 4/4, voice-client 6/6, overnight-proposal-contract 3/3, overnight-db-bounds 1/1, overnight-wait-resume 4 of 5 (one test refused, see below).
- `npm run smoke` (board and record agree on "needs a person" for 100 orders) and `npm run attachments:smoke` (both download formats), both with `APP_URL` pointed at the test app.
- Pages `/`, `/incidents`, `/incidents/orders`, `/inbox`, `/incidents?view=workspace` returned 200; screenshots show the official wordmark and the Orders and All-supplied-orders views.

## Not run or not passing
- `voice-server`, `operational-persistence` and one `overnight-wait-resume` test failed at their own guard: each insists on a database on a fixed port (15440 or 15438). That guard protects other data; the failures say nothing about the product. They need those exact databases.
- `docker compose` was not available on this machine, so the README's `docker compose up -d --wait` was not run; the same two images and settings were started with `docker run`.
- No real-provider investigation was run: this environment had no model keys, and the UI showed its "No real agent provider is configured" message. Waiting, approval and execution are covered here only by the provider-double tests.
- ElevenLabs voice remains unverified beyond mocked tests.
- The incident detail page was not viewed in this check.
