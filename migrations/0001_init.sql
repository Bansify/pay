-- Bansify Pay: billing + entitlements schema. Money is always integer paise.

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('subscription','addon')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS prices (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  currency TEXT NOT NULL DEFAULT 'INR',
  amount_paise INTEGER NOT NULL,
  interval TEXT NOT NULL CHECK (interval IN ('month','year','once')),
  provider_price_id TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  user_id TEXT PRIMARY KEY,
  email TEXT,
  provider_customer_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  price_id TEXT NOT NULL,
  provider_subscription_id TEXT UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('created','active','past_due','halted','cancelled','expired')),
  current_period_end INTEGER,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  provider_payment_id TEXT UNIQUE,
  amount_paise INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  raw_json TEXT
);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  number TEXT NOT NULL UNIQUE,
  amount_paise INTEGER NOT NULL,
  gst_paise INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  issued_at INTEGER NOT NULL
);

-- Effective permissions a product grants, e.g. drive.storage.extra_gb = 100
CREATE TABLE IF NOT EXISTS entitlements (
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  source TEXT NOT NULL,
  expires_at INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  type TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  processed_at INTEGER,
  error TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  meta TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_subs_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_entitlements_user ON entitlements(user_id);

INSERT OR IGNORE INTO products (id, code, name, description, kind, active, created_at) VALUES
  ('prod_plus',  'bansify_plus',      'Bansify Plus',      'Core subscription tier',            'subscription', 1, 0),
  ('prod_blue',  'verified_badge',    'Verified badge',    'Blue tick on your Bansify profile', 'addon',        1, 0),
  ('prod_drive', 'drive_storage_100', 'Drive +100 GB',     'Extra Drive storage',               'addon',        1, 0);

INSERT OR IGNORE INTO prices (id, product_id, currency, amount_paise, interval, active, created_at) VALUES
  ('price_plus_m',   'prod_plus',  'INR',  9900, 'month', 1, 0),
  ('price_blue_m',   'prod_blue',  'INR',  4900, 'month', 1, 0),
  ('price_drive_m',  'prod_drive', 'INR',  7900, 'month', 1, 0);
