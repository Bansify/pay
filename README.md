# Bansify Pay

Unified payments, subscriptions and entitlements for the Bansify ecosystem.

One service decides what a user is allowed to do (extra Drive storage, verified badge, Plus tier),
so no product has to implement billing itself.

## Phase 1 (live)

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | liveness, D1 binding, catalog count |
| `GET /api/v1/products` | public catalog: products with their prices |
| `GET /api/v1/entitlements/:userId` | service-to-service read, requires `PAY_INTERNAL_TOKEN` |
| `GET /api/v1/me/entitlements` | user-scoped read, authenticated through Bansify Accounts |

Deployed at `pay.bansify.com` (Worker `pay`, route `pay.bansify.com/api/*`), backed by the D1
database `payments` (`83e2f480-33a9-4e76-825f-9f6096c1dd1c`).

## Schema

`products`, `prices`, `customers`, `subscriptions`, `payments`, `invoices`, `entitlements`,
`webhook_events`, `audit_log` — see `migrations/0001_init.sql`.

Money is always an integer number of paise. No card data is ever stored: checkout (Phase 2) uses
the provider's hosted page and we keep only provider ids.

## Entitlement contract

Products grant keys that other services read:

| Product | Entitlement key | Value |
| --- | --- | --- |
| Bansify Plus | `bansify.plus` | `true` |
| Verified badge | `accounts.verified_badge` | `true` |
| Drive +100 GB | `drive.storage.extra_gb` | `100` |

Consumers call `GET /api/v1/entitlements/:userId` with `x-internal-token` and cache the answer
briefly (60s is plenty; a revoked entitlement must not survive longer than that).

## Next phases

2. Razorpay checkout (test mode first) + billing portal page
3. Webhooks: `payment.captured`, `subscription.charged`, `subscription.halted`, `refund.processed`
   with idempotent event storage, then grant/revoke entitlements
4. Consumers: Accounts blue tick, Drive quota enforcement
5. GST invoices, refunds, admin dashboard, dunning

## Local

```bash
npm install
npx esbuild src/index.ts --bundle --format=esm --outfile=dist/worker.mjs
npx wrangler deploy
```

Secrets (dashboard only): `PAY_INTERNAL_TOKEN`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
`RAZORPAY_WEBHOOK_SECRET`.
