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

    if (path === '/api/v1/me/entitlements' && request.method === 'GET') {
      const userId = await currentUserId(request, env);
      if (!userId) return json({ error: 'unauthenticated' }, 401);
      return json({ userId, entitlements: await loadEntitlements(env, userId) });
    }

    return json({ error: 'not_found' }, 404);
  },
};
