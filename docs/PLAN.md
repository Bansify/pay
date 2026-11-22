# Plan

Each phase is shippable on its own. A phase is done when it is deployed and verified, not when the
code is merged.

## Phase 1 — Foundation (done)

- [x] D1 `payments` with the full billing schema
- [x] Worker `pay` at `pay.bansify.com/api/*`
- [x] Public catalog `GET /api/v1/products`
- [x] Entitlements read: service (`/api/v1/entitlements/:userId`) and user (`/api/v1/me/entitlements`)
- [x] Seed catalog: Bansify Plus, Verified badge, Drive +100 GB
- [x] Static landing page on Pages showing the live catalog

## Phase 2 — Checkout (next)

- [x] `POST /api/v1/checkout` — creates an order and returns a checkout URL
- [x] Test provider (`PROVIDER=mock`): order → settle → subscription → entitlements, no money
- [x] `PAY_INTERNAL_TOKEN` generated and installed on the Worker
- [x] Billing portal view: subscriptions and unlocked entitlements
- [ ] Razorpay **test mode** keys wired as Worker secrets
- [ ] Razorpay order creation + hosted checkout (replaces the mock link)
- [ ] `/pay/return` page — "payment received, activating…" (no entitlement granted here)
- [ ] Invoices list in the portal, cancel flow

Exit criteria: a payment completes end to end and the row lands in `payments`.

## Phase 3 — Webhooks and entitlements

- [ ] `POST /api/v1/webhooks/razorpay` with HMAC signature verification
- [ ] Idempotent event storage in `webhook_events`
- [ ] Subscription state machine: `created → active → past_due → halted → cancelled`
- [ ] Grant/revoke entitlements from subscription state
- [ ] Replay-safe: same event twice changes nothing

Exit criteria: a test webhook grants `drive.storage.extra_gb = 100`, a cancellation removes it.

## Phase 4 — Consumers

- [ ] Accounts: blue tick driven by `accounts.verified_badge`
- [ ] Drive: quota = base + `drive.storage.extra_gb`
- [ ] Mail/others: respect `bansify.plus` where it changes limits
- [ ] Cache the entitlement read (60s) in each consumer

Exit criteria: buying the add-on changes what the product actually allows, within a minute.

## Phase 5 — Money operations

- [ ] GST invoices: 18%, place of supply, sequential numbering
- [ ] Refunds (full/partial) with entitlement rollback
- [ ] Dunning: retries, grace period, emails
- [ ] Admin dashboard: subscriptions, payments, manual grants with an audit trail
- [ ] Reconciliation report: provider settlements vs `payments` rows

## Open questions for the owner

1. Are prices tax-inclusive or exclusive? Invoices must state it.
2. Refund window and policy text (legal review).
3. Does Plus include the badge and storage, or are they always separate add-ons?
4. Business entity details for the invoice header (GSTIN, address).
