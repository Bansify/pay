# Setup

Everything runs on Cloudflare: one Worker (`pay`), one Pages project (`pay`) and one D1 database
(`payments`). No server to provision, no container to keep warm.

## 1. Prerequisites

| Item | Value used in production |
| --- | --- |
| Cloudflare account | Bansify (`53c7503cbecd6c548349980df2dc7b7f`) |
| Zone | `bansify.com` (`107ef6365cfe8f2034c60f56af1066f1`) |
| D1 database | `payments` (`83e2f480-33a9-4e76-825f-9f6096c1dd1c`) |
| Worker | `pay`, route `pay.bansify.com/api/*` |
| Pages project | `pay`, custom domain `pay.bansify.com` |
| Tooling | Node 20+, `wrangler` 4.x |

A Cloudflare API token needs `Account → Workers Scripts: Edit`, `Account → Cloudflare Pages: Edit`,
`Account → D1: Edit`, `Zone → DNS: Edit` and `Zone → Workers Routes: Edit`.

## 2. Create the database

```bash
npx wrangler d1 create payments
# copy the printed uuid into wrangler.toml -> [[d1_databases]] database_id
```

Apply the schema. `wrangler d1 execute` runs one statement at a time, so loop the file:

```bash
for stmt in $(awk 'BEGIN{RS=";"} !/^--/ {print}' migrations/0001_init.sql); do
  npx wrangler d1 execute payments --remote --command "$stmt"
done
```

Verify:

```bash
npx wrangler d1 execute payments --remote --command "SELECT COUNT(*) FROM products"   # 3
```

## 3. Deploy the Worker

```bash
npm install
npx esbuild src/index.ts --bundle --format=esm --platform=neutral --target=es2022 \
  --outfile=dist/worker.mjs
npx wrangler deploy
```

`wrangler.toml` already declares the route, the D1 binding and the public vars
(`ENVIRONMENT`, `AUTH_HUB_URL`, `APP_DOMAIN`).

## 4. Deploy the Pages site

The site in `web/` is static — no build step. Either connect the repository in the Cloudflare
dashboard (build command empty, output directory `web`) or use direct upload:

```bash
npx wrangler pages deploy web --project-name pay
```

Then attach the domain: **Pages → pay → Custom domains → `pay.bansify.com`**.

The hostname carries both surfaces: the Worker route `pay.bansify.com/api/*` wins for API calls,
Pages serves everything else.

## 5. DNS

| Name | Type | Target | Proxy |
| --- | --- | --- | --- |
| `pay.bansify.com` | CNAME | `pay.pages.dev` (or the project's `<hash>.pay.pages.dev`) | Proxied |

A Worker-only hostname (before Pages exists) uses a proxied `AAAA 100::` record instead.

## 6. Secrets

Set these in **Workers → pay → Settings → Variables and Secrets** (never in the repository):

| Secret | Purpose |
| --- | --- |
| `PROVIDER` (plain var) | `mock` while no gateway is connected, `razorpay` once keys exist |
| `PAY_INTERNAL_TOKEN` | service-to-service reads of `/api/v1/entitlements/:userId` |
| `RAZORPAY_KEY_ID` | checkout (Phase 2) |
| `RAZORPAY_KEY_SECRET` | checkout (Phase 2) |
| `RAZORPAY_WEBHOOK_SECRET` | webhook signature verification (Phase 3) |

```bash
npx wrangler secret put PAY_INTERNAL_TOKEN
```

Consumers (Drive, Accounts) hold the same `PAY_INTERNAL_TOKEN` and send it as `x-internal-token`.

## 7. Verify

```bash
curl -s https://pay.bansify.com/api/health | jq
# { "ok": true, "database": { "bound": true, "products": 3 }, ... }

curl -s https://pay.bansify.com/api/v1/products | jq '.products[].code'
# "verified_badge", "drive_storage_100", "bansify_plus"
```

## 8. Local development

```bash
npx wrangler dev --local        # Worker on http://localhost:8787
npx wrangler d1 execute payments --local --command "SELECT 1"
```

`wrangler dev` uses a local copy of D1 seeded by applying `migrations/0001_init.sql` with `--local`.
