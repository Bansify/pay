/**
 * Bansify Pay — billing and entitlement service.
 *
 * Phase 1 scope (this file):
 *   GET /api/health                       liveness + config booleans
 *   GET /api/v1/products                  public catalog (products + prices)
 *   GET /api/v1/entitlements/:userId      service-to-service read, needs PAY_INTERNAL_TOKEN
 *   GET /api/v1/me/entitlements           user-scoped read, authenticated through Bansify Accounts
 *
 * Money is always an integer number of paise. Nothing here stores card data: the checkout step
 * (Phase 2) hands the user to the provider's hosted page and we only keep provider ids.
 */

export interface Env {
  DB: D1Database;
  ENVIRONMENT: string;
  AUTH_HUB_URL: string;
  APP_DOMAIN: string;
  PAY_INTERNAL_TOKEN?: string;
  RAZORPAY_KEY_ID?: string;
  RAZORPAY_KEY_SECRET?: string;
}

const JSON_HEADERS: Record<string, string> = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, authorization, x-internal-token',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...extra } });
}

function now(): number {
  return Date.now();
}

interface EntitlementRow {
  key: string;
  value_json: string;
  source: string;
  expires_at: number | null;
}

/** Reads the effective entitlements for a user, dropping anything that has expired. */
async function loadEntitlements(env: Env, userId: string): Promise<Record<string, unknown>> {
  const { results } = await env.DB.prepare(
    `SELECT key, value_json, source, expires_at FROM entitlements WHERE user_id = ?`,
  )
    .bind(userId)
    .all<EntitlementRow>();

  const out: Record<string, unknown> = {};
  const stamp = now();
  for (const row of results ?? []) {
    if (row.expires_at !== null && row.expires_at !== undefined && row.expires_at < stamp) continue;
    try {
      out[row.key] = JSON.parse(row.value_json);
    } catch {
      // A malformed row must never break the whole response.
    }
  }
  return out;
}

/** Verifies the caller through the Accounts session cookie or bearer token. */
async function currentUserId(request: Request, env: Env): Promise<string | null> {
  const authorization = request.headers.get('authorization');
  const cookie = request.headers.get('cookie');
  if (!authorization && !cookie) return null;

  const upstream = await fetch(`${env.AUTH_HUB_URL}/api/auth/me`, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      ...(authorization ? { authorization } : {}),
      ...(cookie ? { cookie } : {}),
    },
  }).catch(() => null);

  if (!upstream || !upstream.ok) return null;
  const body = (await upstream.json().catch(() => null)) as
    | { user?: { id?: string; userId?: string }; id?: string }
    | null;
  return body?.user?.id ?? body?.user?.userId ?? body?.id ?? null;
}

function internalAuthorised(request: Request, env: Env): boolean {
  if (!env.PAY_INTERNAL_TOKEN) return false;
  const presented =
    request.headers.get('x-internal-token') ??
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    '';
  // Constant-time-ish comparison; both sides are short service tokens.
  if (presented.length !== env.PAY_INTERNAL_TOKEN.length) return false;
  let diff = 0;
  for (let i = 0; i < presented.length; i += 1) {
    diff |= presented.charCodeAt(i) ^ env.PAY_INTERNAL_TOKEN.charCodeAt(i);
  }
  return diff === 0;
}

interface SubscriptionRow {
  id: string;
  product_id: string;
  price_id: string;
  status: string;
  current_period_end: number | null;
  cancel_at_period_end: number;
}

async function loadSubscriptions(env: Env, userId: string): Promise<Array<Record<string, unknown>>> {
  const { results } = await env.DB.prepare(
    `SELECT s.id, s.product_id, s.price_id, s.status, s.current_period_end, s.cancel_at_period_end,
            p.name AS product_name, p.code AS product_code
       FROM subscriptions s
       LEFT JOIN products p ON p.id = s.product_id
      WHERE s.user_id = ?
      ORDER BY s.created_at DESC`,
  )
    .bind(userId)
    .all<SubscriptionRow & { product_name?: string; product_code?: string }>();

  return (results ?? []).map((row) => ({
    id: row.id,
    productId: row.product_id,
    productName: row.product_name ?? null,
    productCode: row.product_code ?? null,
    priceId: row.price_id,
    status: row.status,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
  }));
}

async function handleProducts(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT p.id, p.code, p.name, p.description, p.kind,
            pr.id AS price_id, pr.currency, pr.amount_paise, pr.interval
       FROM products p
       JOIN prices pr ON pr.product_id = p.id AND pr.active = 1
      WHERE p.active = 1
      ORDER BY p.kind, pr.amount_paise`,
  ).all();

  const products = new Map<string, Record<string, unknown>>();
  for (const row of (results ?? []) as Array<Record<string, unknown>>) {
    const id = String(row.id);
    if (!products.has(id)) {
      products.set(id, {
        id,
        code: row.code,
        name: row.name,
        description: row.description,
        kind: row.kind,
        prices: [],
      });
    }
    (products.get(id)!.prices as Array<Record<string, unknown>>).push({
      id: row.price_id,
      currency: row.currency,
      amountPaise: row.amount_paise,
      interval: row.interval,
    });
  }
  return json({ products: [...products.values()] });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: JSON_HEADERS });

    if (path === '/api/health' || path === '/health') {
      const probe = await env.DB.prepare('SELECT COUNT(*) AS n FROM products')
        .all<{ n: number }>()
        .catch(() => null);
      return json({
        ok: true,
        service: 'bansify-pay',
        environment: env.ENVIRONMENT,
        database: { bound: Boolean(env.DB), products: probe?.results?.[0]?.n ?? null },
        configured: {
          internalToken: Boolean(env.PAY_INTERNAL_TOKEN),
          authHub: Boolean(env.AUTH_HUB_URL),
          razorpay: Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET),
        },
      });
    }

    if (path === '/api/v1/products' && request.method === 'GET') {
      return handleProducts(env);
    }

    const serviceMatch = path.match(/^\/api\/v1\/entitlements\/([\w.:-]+)$/);
    if (serviceMatch && request.method === 'GET') {
      if (!internalAuthorised(request, env)) return json({ error: 'forbidden' }, 403);
      const userId = decodeURIComponent(serviceMatch[1]);
      return json({ userId, entitlements: await loadEntitlements(env, userId) });
    }

    if (path === '/api/v1/me/subscriptions' && request.method === 'GET') {
      const userId = await currentUserId(request, env);
      if (!userId) return json({ error: 'unauthenticated' }, 401);
      return json({ userId, subscriptions: await loadSubscriptions(env, userId) });
    }

    if (path === '/api/v1/checkout' && request.method === 'POST') {
      const userId = await currentUserId(request, env);
      if (!userId) return json({ error: 'unauthenticated' }, 401);

      const body = (await request.json().catch(() => null)) as { priceId?: string } | null;
      const priceId = body?.priceId?.trim();
      if (!priceId) return json({ error: 'price_required' }, 400);

      const price = await env.DB.prepare(
        `SELECT pr.id, pr.amount_paise, pr.currency, pr.interval, p.id AS product_id, p.name
           FROM prices pr JOIN products p ON p.id = pr.product_id
          WHERE pr.id = ? AND pr.active = 1 AND p.active = 1`,
      )
        .bind(priceId)
        .first<{ id: string; amount_paise: number; currency: string; interval: string; product_id: string; name: string }>();

      if (!price) return json({ error: 'unknown_price' }, 404);

      // The provider is not wired yet: answer honestly instead of pretending to charge.
      if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
        return json({
          error: 'payments_not_configured',
          message: 'Checkout opens once the payment provider keys are installed.',
          price: { id: price.id, amountPaise: price.amount_paise, currency: price.currency, interval: price.interval },
          product: { id: price.product_id, name: price.name },
        }, 503);
      }

      // Phase 2 continues here: create the provider order/subscription and return its checkout URL.
      return json({ error: 'not_implemented' }, 501);
    }

    if (path === '/api/v1/me/entitlements' && request.method === 'GET') {
      const userId = await currentUserId(request, env);
      if (!userId) return json({ error: 'unauthenticated' }, 401);
      return json({ userId, entitlements: await loadEntitlements(env, userId) });
    }

    return json({ error: 'not_found' }, 404);
  },
};
