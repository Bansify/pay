# API

Base URL: `https://pay.bansify.com`. All responses are JSON. Money is an integer number of paise.

## `GET /api/health`

Liveness and configuration. No authentication.

```json
{
  "ok": true,
  "service": "bansify-pay",
  "environment": "production",
  "database": { "bound": true, "products": 3 },
  "configured": { "internalToken": false, "authHub": true }
}
```

## `GET /api/v1/products`

Public catalog. Products with their active prices.

```json
{
  "products": [
    {
      "id": "prod_plus",
      "code": "bansify_plus",
      "name": "Bansify Plus",
      "description": "Core subscription tier",
      "kind": "subscription",
      "prices": [
        { "id": "price_plus_m", "currency": "INR", "amountPaise": 9900, "interval": "month" }
      ]
    }
  ]
}
```

`kind` is `subscription` or `addon`. `interval` is `month`, `year` or `once`.

## `GET /api/v1/entitlements/:userId`

Service-to-service. Requires `x-internal-token: <PAY_INTERNAL_TOKEN>` (or the same value as a bearer
token). Returns 403 when the token is missing or wrong.

```json
{
  "userId": "user_123",
  "entitlements": { "drive.storage.extra_gb": 100, "accounts.verified_badge": true }
}
```

Expired rows are omitted, so a consumer never has to check `expires_at` itself.

## `GET /api/v1/me/entitlements`

User-scoped. Authenticates by forwarding the caller's `Authorization` or `Cookie` header to Bansify
Accounts (`AUTH_HUB_URL/api/auth/me`). Returns `401 {"error":"unauthenticated"}` when that fails.

```json
{ "userId": "user_123", "entitlements": { "bansify.plus": true } }
```

## Planned

| Endpoint | Phase |
| --- | --- |
| `POST /api/v1/checkout` | 2 |
| `POST /api/v1/webhooks/razorpay` | 3 |
| `GET /api/v1/me/subscriptions` | 2 |
| `GET /api/v1/me/invoices` | 5 |

## Errors

| Status | Body | Meaning |
| --- | --- | --- |
| 400 | `{"error":"bad_request"}` | malformed input |
| 401 | `{"error":"unauthenticated"}` | no valid Bansify session |
| 403 | `{"error":"forbidden"}` | wrong or missing service token |
| 404 | `{"error":"not_found"}` | unknown path |
| 500 | `{"error":"server_error"}` | D1 or provider failure |
