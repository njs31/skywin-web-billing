-- Phase A/B/C schema for Skywin final client changes
-- Safe to re-run (IF NOT EXISTS)

ALTER TABLE customers ADD COLUMN IF NOT EXISTS acre text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS crop text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS pin_code text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS village text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS taluk text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS district text;

ALTER TABLE sales ADD COLUMN IF NOT EXISTS round_off numeric(14,2) DEFAULT 0 NOT NULL;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS po_number text;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS purchase_order_id integer;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS eway_bill_no text;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS vehicle_no text;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS dispatched_through text;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS destination text;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS delivery_note text;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_terms text;

ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS cgst numeric(14,2) DEFAULT 0 NOT NULL;
ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS sgst numeric(14,2) DEFAULT 0 NOT NULL;
ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS igst numeric(14,2) DEFAULT 0 NOT NULL;
ALTER TABLE purchase_return_items ADD COLUMN IF NOT EXISTS gst_rate numeric(5,2) DEFAULT 0 NOT NULL;

CREATE TABLE IF NOT EXISTS purchase_orders (
  id serial PRIMARY KEY,
  po_number text NOT NULL UNIQUE,
  customer_id integer REFERENCES customers(id),
  customer_name text,
  customer_phone text,
  date timestamp DEFAULT now() NOT NULL,
  notes text,
  subtotal numeric(14,2) DEFAULT 0 NOT NULL,
  grand_total numeric(14,2) DEFAULT 0 NOT NULL,
  status text DEFAULT 'open' NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id serial PRIMARY KEY,
  purchase_order_id integer NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id integer REFERENCES products(id),
  custom_name text,
  qty numeric(14,2) NOT NULL,
  rate numeric(14,2) NOT NULL,
  amount numeric(14,2) NOT NULL,
  hsn_code text
);
