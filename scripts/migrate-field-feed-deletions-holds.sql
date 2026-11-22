-- In-app notification feed holds every push, not only order updates.
ALTER TABLE order_notifications ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE order_notifications ADD COLUMN IF NOT EXISTS url text;

-- Farmer account deletion requests, approved by an admin on /field/deletions.
CREATE TABLE IF NOT EXISTS field_deletion_requests (
  id serial PRIMARY KEY,
  phone text NOT NULL,
  name text,
  village text,
  customer_ids integer[] NOT NULL DEFAULT '{}'::integer[],
  status text NOT NULL DEFAULT 'pending',
  requested_at timestamp NOT NULL DEFAULT now(),
  decided_at timestamp,
  decided_by text
);
CREATE INDEX IF NOT EXISTS field_deletion_requests_status_idx ON field_deletion_requests (status);
CREATE INDEX IF NOT EXISTS field_deletion_requests_phone_idx ON field_deletion_requests (phone);

-- Stock held while a Field app customer pays (lib/stock-holds.ts).
CREATE TABLE IF NOT EXISTS stock_holds (
  id serial PRIMARY KEY,
  hold_key text NOT NULL,
  owner_phone text,
  product_id integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  batch_id integer,
  qty numeric(14,2) NOT NULL,
  status text NOT NULL DEFAULT 'active',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stock_holds_product_status_idx ON stock_holds (product_id, status);
CREATE INDEX IF NOT EXISTS stock_holds_key_idx ON stock_holds (hold_key);
CREATE INDEX IF NOT EXISTS stock_holds_owner_idx ON stock_holds (owner_phone);

-- Paid field orders refunded automatically because the stock was gone at billing.
CREATE TABLE IF NOT EXISTS field_unfilled_orders (
  order_id text PRIMARY KEY,
  payment_id text NOT NULL,
  phone text,
  amount numeric(14,2),
  refund_id text,
  reason text,
  status text NOT NULL DEFAULT 'refunding',
  created_at timestamp NOT NULL DEFAULT now()
);
