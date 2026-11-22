# Bansify Pay

Unified payments, subscriptions and entitlements for the Bansify ecosystem.

One service decides what a user is allowed to do (extra Drive storage, verified badge, Plus tier),
so no product has to implement billing itself.

## Documentation

| Document | Contents |
| --- | --- |
| [docs/SETUP.md](docs/SETUP.md) | first-time setup: database, Worker, Pages, DNS, secrets, verification |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | structure, data model, entitlement contract, security and failure behaviour |
| [docs/API.md](docs/API.md) | endpoint reference with request/response shapes |
| [docs/PLAN.md](docs/PLAN.md) | phased roadmap and open questions for the owner |

## Phase 1 (live)

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | liveness, D1 binding, catalog count |
| `GET /api/v1/products` | public catalog: products with their prices |
| `GET /api/v1/entitlements/:userId` | service-to-service read, requires `PAY_INTERNAL_TOKEN` |
| `GET /api/v1/me/entitlements` | user-scoped read, authenticated through Bansify Accounts |
| `GET /api/v1/me/subscriptions` | the caller's subscriptions |
| `POST /api/v1/checkout` | create an order, get a checkout URL |
| `POST /api/v1/mock/pay` | test provider only: settle an order with no money |

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

## Providers

`PROVIDER` selects how money is collected:

| Value | Behaviour |
| --- | --- |
| `mock` (current) | `POST /api/v1/checkout` returns a link to our own test checkout page; `POST /api/v1/mock/pay` settles the order, opens the subscription and grants entitlements. No money moves, no gateway account needed. |
| `razorpay` | Real gateway: hosted checkout, then webhooks settle the order. Enabled automatically when the Razorpay keys are installed. |

Both paths end in the same `settleOrder()` function, so switching providers does not change how
entitlements are granted.

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
