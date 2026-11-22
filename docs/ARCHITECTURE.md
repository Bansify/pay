# Architecture

## Shape

```
                       ┌──────────────────────────────┐
  browser / Android ──▶│  pay.bansify.com             │
                       │  /api/*  → Worker "pay"      │──▶ D1 "payments"
                       │  other   → Pages (static UI) │
                       └──────────────────────────────┘
                                   ▲        ▲
                service token      │        │  webhook (Razorpay)
        Drive / Accounts / Mail ───┘        │
                                             │
                                   Razorpay ─┘
```

One hostname, two surfaces. The Worker route only claims `/api/*`, so the static site keeps working
under the same origin (no CORS, no second domain to configure).

## Why a separate service

Billing decisions are the only thing every product must agree on. If Drive enforced its own quota and
Accounts its own badge flag, a refund or a failed renewal would have to be replayed in each product.
Here the answer lives once, in `entitlements`, and products read it.

## Data model (`migrations/0001_init.sql`)

| Table | Holds |
| --- | --- |
| `products` | what can be sold (`kind`: `subscription` or `addon`) |
| `prices` | one row per currency/interval; `amount_paise` integer |
| `customers` | Bansify `user_id` → provider customer id |
| `subscriptions` | state machine per user/product, provider id, period end |
| `payments` | one row per captured payment (provider id unique) |
| `invoices` | numbered documents for GST |
| `entitlements` | `(user_id, key)` → JSON value, source, expiry |
| `webhook_events` | provider event id primary key — the idempotency guard |
| `audit_log` | who changed what, when |

Money is an integer number of paise everywhere. No floats, no rounding drift.

## Entitlement contract

Products grant keys, consumers read them:

| Product | Key | Value |
| --- | --- | --- |
| Bansify Plus | `bansify.plus` | `true` |
| Verified badge | `accounts.verified_badge` | `true` |
| Drive +100 GB | `drive.storage.extra_gb` | `100` |

`GET /api/v1/entitlements/:userId` with `x-internal-token` returns the effective map, dropping rows
whose `expires_at` has passed. Consumers should cache for ~60 seconds: short enough that a revocation
takes effect quickly, long enough to keep D1 out of the hot path.

## Identity

There is no second login. `GET /api/v1/me/entitlements` forwards the caller's `Authorization` or
`Cookie` header to `AUTH_HUB_URL/api/auth/me` (Bansify Accounts) and uses the returned user id. A
failed lookup is a 401, never a silent anonymous answer.

## Security decisions

- **No card data.** Checkout (Phase 2) redirects to the provider's hosted page; we store only
  `provider_payment_id`, `provider_subscription_id` and `provider_customer_id`.
- **Webhook first.** Entitlements are granted by verified webhooks, not by the browser returning to a
  success URL — a user who closes the tab must still get what they paid for.
- **Idempotency.** `webhook_events.id` is the provider's event id; a replayed delivery is a no-op.
- **Service token comparison** is length-checked and constant-time in the Worker.
- **Secrets** live only in Cloudflare; the repository contains none.

## Failure behaviour

| Situation | Behaviour |
| --- | --- |
| D1 unreachable | `/api/health` reports `database.bound` and the endpoint returns 500; consumers fall back to "no entitlement" |
| Accounts lookup fails | `401 unauthenticated`, never an empty 200 |
| Provider webhook unsigned | `400`, nothing written |
| Duplicate webhook | `200`, no second write |
