/**
 * Bansify Pay — billing and entitlement service.
 *
 * Endpoints
 *   GET  /api/health                        liveness + provider/config readiness
 *   GET  /api/v1/products                   public catalog (products + prices)
 *   GET  /api/v1/entitlements/:userId       service-to-service read (PAY_INTERNAL_TOKEN)
 *   GET  /api/v1/me/entitlements            user read (Bansify Accounts session)
 *   GET  /api/v1/me/subscriptions           user read
 *   POST /api/v1/checkout                   create an order, return where to send the user
 *   POST /api/v1/mock/pay                   test provider only: settle an order without money
 *
 * Money is an integer number of paise. No card data is stored: a real provider checkout happens on
 * the provider's own page and we keep only provider ids.
 */

export interface Env {
  DB: D1Database;
  ENVIRONMENT: string;
  AUTH_HUB_URL: string;
  APP_DOMAIN: string;
  /** `mock` (default while no gateway is connected) or `razorpay`. */
  PROVIDER?: string;
  PAY_INTERNAL_TOKEN?: string;
  RAZORPAY_KEY_ID?: string;
  RAZORPAY_KEY_SECRET?: string;
  RAZORPAY_WEBHOOK_SECRET?: string;
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

const now = () => Date.now();

/** Which entitlement keys a product grants, and with what value. */
const ENTITLEMENTS_BY_CODE: Record<string, Array<{ key: string; value: unknown }>> = {
  bansify_plus: [{ key: 'bansify.plus', value: true }],
  verified_badge: [{ key: 'accounts.verified_badge', value: true }],
  drive_storage_100: [{ key: 'drive.storage.extra_gb', value: 100 }],
};

const INTERVAL_DAYS: Record<string, number> = { month: 30, year: 365 };

function providerOf(env: Env): string {
  return (env.PROVIDER ?? (env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET ? 'razorpay' : 'mock')).toLowerCase();
}

interface EntitlementRow {
  key: string;
  value_json: string;
  source: string;
  expires_at: number | null;
}

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
    .all<Record<string, unknown>>();

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
  if (presented.length !== env.PAY_INTERNAL_TOKEN.length) return false;
  let diff = 0;
  for (let i = 0; i < presented.length; i += 1) {
    diff |= presented.charCodeAt(i) ^ env.PAY_INTERNAL_TOKEN.charCodeAt(i);
  }
  return diff === 0;
}

function orderId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return 'ord_' + [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
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
      products.set(id, { id, code: row.code, name: row.name, description: row.description, kind: row.kind, prices: [] });
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

interface PriceRow {
  id: string;
  amount_paise: number;
  currency: string;
  interval: string;
  product_id: string;
  product_code: string;
  product_name: string;
}

async function loadPrice(env: Env, priceId: string): Promise<PriceRow | null> {
  return env.DB.prepare(
    `SELECT pr.id, pr.amount_paise, pr.currency, pr.interval,
            p.id AS product_id, p.code AS product_code, p.name AS product_name
       FROM prices pr JOIN products p ON p.id = pr.product_id
      WHERE pr.id = ? AND pr.active = 1 AND p.active = 1`,
  )
    .bind(priceId)
    .first<PriceRow>();
}

/** Settles an order: records the payment, opens the subscription and grants entitlements. */
async function settleOrder(env: Env, order: Record<string, unknown>, provider: string, providerPaymentId: string) {
  const stamp = now();
  const price = await loadPrice(env, String(order.price_id));
  if (!price) throw new Error('price_missing');

  await env.DB.batch([
    env.DB.prepare(`UPDATE orders SET status = 'paid', paid_at = ? WHERE id = ? AND status = 'created'`)
      .bind(stamp, order.id),
    env.DB.prepare(
      `INSERT OR IGNORE INTO payments (id, user_id, provider_payment_id, amount_paise, currency, status, created_at, raw_json)
       VALUES (?, ?, ?, ?, ?, 'captured', ?, ?)`,
    ).bind('pay_' + providerPaymentId, order.user_id, providerPaymentId, order.amount_paise,
           order.currency, stamp, JSON.stringify({ provider, orderId: order.id })),
  ]);

  const days = INTERVAL_DAYS[price.interval] ?? null;
  const periodEnd = days ? stamp + days * 86_400_000 : null;
  const subId = 'sub_' + String(order.id).slice(4);

  await env.DB.prepare(
    `INSERT INTO subscriptions (id, user_id, product_id, price_id, provider_subscription_id, status, current_period_end, cancel_at_period_end, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'active', ?, 0, ?, ?)
     ON CONFLICT(id) DO UPDATE SET status = 'active', current_period_end = excluded.current_period_end, updated_at = excluded.updated_at`,
  )
    .bind(subId, order.user_id, price.product_id, price.id, `${provider}:${providerPaymentId}`, periodEnd, stamp, stamp)
    .run();

  const grants = ENTITLEMENTS_BY_CODE[price.product_code] ?? [];
  for (const grant of grants) {
    await env.DB.prepare(
      `INSERT INTO entitlements (user_id, key, value_json, source, expires_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, key) DO UPDATE SET value_json = excluded.value_json, source = excluded.source,
         expires_at = excluded.expires_at, updated_at = excluded.updated_at`,
    )
      .bind(order.user_id, grant.key, JSON.stringify(grant.value), `order:${order.id}`, periodEnd, stamp)
      .run();
  }

  await env.DB.prepare(
    `INSERT INTO audit_log (id, actor, action, target, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind('aud_' + providerPaymentId, `user:${order.user_id}`, 'order.paid', String(order.id),
          JSON.stringify({ provider, product: price.product_code, entitlements: grants.map((g) => g.key) }), stamp)
    .run();

  return { subscriptionId: subId, entitlements: grants.map((g) => g.key), periodEnd };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const provider = providerOf(env);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: JSON_HEADERS });

    if (path === '/api/health' || path === '/health') {
      const probe = await env.DB.prepare('SELECT COUNT(*) AS n FROM products').all<{ n: number }>().catch(() => null);
      return json({
        ok: true,
        service: 'bansify-pay',
        environment: env.ENVIRONMENT,
        provider,
        database: { bound: Boolean(env.DB), products: probe?.results?.[0]?.n ?? null },
        configured: {
          internalToken: Boolean(env.PAY_INTERNAL_TOKEN),
          authHub: Boolean(env.AUTH_HUB_URL),
          razorpay: Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET),
          webhookSecret: Boolean(env.RAZORPAY_WEBHOOK_SECRET),
        },
      });
    }

    if (path === '/api/v1/products' && request.method === 'GET') return handleProducts(env);

    const serviceMatch = path.match(/^\/api\/v1\/entitlements\/([\w.:-]+)$/);
    if (serviceMatch && request.method === 'GET') {
      if (!internalAuthorised(request, env)) return json({ error: 'forbidden' }, 403);
      const userId = decodeURIComponent(serviceMatch[1]);
      return json({ userId, entitlements: await loadEntitlements(env, userId) });
    }

    if (path === '/api/v1/me/entitlements' && request.method === 'GET') {
      const userId = await currentUserId(request, env);
      if (!userId) return json({ error: 'unauthenticated' }, 401);
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

      const price = await loadPrice(env, priceId);
      if (!price) return json({ error: 'unknown_price' }, 404);

      const id = orderId();
      await env.DB.prepare(
        `INSERT INTO orders (id, user_id, price_id, product_id, amount_paise, currency, status, provider, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'created', ?, ?)`,
      )
        .bind(id, userId, price.id, price.product_id, price.amount_paise, price.currency, provider, now())
        .run();

      const base = `https://pay.${env.APP_DOMAIN}`;
      const summary = {
        id,
        amountPaise: price.amount_paise,
        currency: price.currency,
        interval: price.interval,
        product: { id: price.product_id, name: price.product_name, code: price.product_code },
      };

      if (provider === 'razorpay') {
        // Phase 3 wires the real provider order here; until then the keys are not installed.
        return json({ error: 'not_implemented', provider, order: summary }, 501);
      }

      // Test provider: the user is sent to our own checkout page, which calls /api/v1/mock/pay.
      const q = new URLSearchParams({
        order: id,
        amount: String(price.amount_paise),
        interval: price.interval,
        name: price.product_name,
      });
      return json({ provider: 'mock', order: summary, checkoutUrl: `${base}/#/pay?${q.toString()}` }, 200);
    }

    if (path === '/api/v1/mock/pay' && request.method === 'POST') {
      if (provider !== 'mock') return json({ error: 'mock_disabled' }, 403);

      const body = (await request.json().catch(() => null)) as { orderId?: string } | null;
      const id = body?.orderId?.trim();
      if (!id) return json({ error: 'order_required' }, 400);

      const order = await env.DB.prepare(`SELECT * FROM orders WHERE id = ?`).bind(id).first<Record<string, unknown>>();
      if (!order) return json({ error: 'unknown_order' }, 404);

      // The owner of the order may settle it; the service token may settle anything (for tests).
      const asService = internalAuthorised(request, env);
      if (!asService) {
        const userId = await currentUserId(request, env);
        if (!userId) return json({ error: 'unauthenticated' }, 401);
        if (userId !== order.user_id) return json({ error: 'forbidden' }, 403);
      }

      if (order.status === 'paid') {
        return json({ ok: true, alreadyPaid: true, orderId: id, entitlements: await loadEntitlements(env, String(order.user_id)) });
      }

      const paymentId = 'mock_' + String(id).slice(4);
      const settled = await settleOrder(env, order, 'mock', paymentId);
      return json({
        ok: true,
        orderId: id,
        paymentId,
        testMode: true,
        subscriptionId: settled.subscriptionId,
        entitlements: await loadEntitlements(env, String(order.user_id)),
        message: 'Test provider: no money moved.',
      });
    }

    return json({ error: 'not_found' }, 404);
  },
};
