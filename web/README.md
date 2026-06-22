# web — tokenboard Next.js app

SSR pages + `/api/v1/*` route handlers (business logic), Supabase Auth (GitHub), Drizzle over
Postgres, and the Upstash Redis leaderboard. See `../ARCHITECTURE.md` for the canonical design.

## Local dev

```bash
pnpm --filter web dev   # reads web/.env.local (gitignored)
```

## Leaderboard ops (Phase 6)

The nightly **decay sweep** (§7.3) runs as an Upstash QStash schedule that POSTs a signed request to
`/api/cron/leaderboard-sweep` at 00:10 UTC. The route is built + tested; **creating the schedule is a
one-time post-deploy ops step** (it needs the public prod URL — QStash can't reach localhost):

```ts
import { Client } from "@upstash/qstash";
const qstash = new Client({ token: process.env.QSTASH_TOKEN! });
await qstash.schedules.create({
  destination: "https://<prod-host>/api/cron/leaderboard-sweep", // == SWEEP_PUBLIC_URL + path
  scheduleId: "leaderboard-sweep-nightly", // fixed id => idempotent (no dupes on re-run)
  cron: "10 0 * * *",                       // 00:10 UTC (UTC is QStash's default)
});
```

- `SWEEP_PUBLIC_URL` (deploy env) **must equal the schedule destination origin**, or the route's
  signature verify will 401 (it reconstructs the signed URL from `SWEEP_PUBLIC_URL`, not `request.url`,
  which differs behind a proxy).
- Local test: `npx @upstash/qstash-cli dev` prints dev signing keys; set them + `SWEEP_PUBLIC_URL=
  http://localhost:3000`, then POST a signed request to the route.
- The route is idempotent (two-phase snapshot → ZUNIONSTORE rebuild), so QStash retries / a DLQ replay
  are safe.

**Rebuild from Postgres** (§7.6 — Redis loss is a non-event): `/api/cron/leaderboard-rebuild` (same
signature gate), or locally `pnpm exec dotenv -e ../.env -- tsx scripts/rebuild-boards.ts`.
