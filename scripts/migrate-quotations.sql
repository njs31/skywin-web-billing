-- Quotation tables + sales.quotation_number
-- Safe to re-run

ALTER TABLE sales ADD COLUMN IF NOT EXISTS quotation_number text;

CREATE TABLE IF NOT EXISTS quotations (
  id serial PRIMARY KEY,
  quotation_no text NOT NULL UNIQUE,
  customer_id integer REFERENCES customers(id),
  customer_name text,
  customer_phone text,
  date timestamp DEFAULT now() NOT NULL,
  payment_terms text,
  dispatched_through text,
  destination text,
  notes text,
  subtotal numeric(14,2) DEFAULT 0 NOT NULL,
  cgst numeric(14,2) DEFAULT 0 NOT NULL,
  sgst numeric(14,2) DEFAULT 0 NOT NULL,
  igst numeric(14,2) DEFAULT 0 NOT NULL,
  round_off numeric(14,2) DEFAULT 0 NOT NULL,
  grand_total numeric(14,2) DEFAULT 0 NOT NULL,
  status text DEFAULT 'open' NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS quotation_items (
  id serial PRIMARY KEY,
  quotation_id integer NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  product_id integer REFERENCES products(id),
  custom_name text,
  qty numeric(14,2) NOT NULL,
  rate numeric(14,2) NOT NULL,
  gst_rate numeric(5,2) DEFAULT 0 NOT NULL,
  discount_percent numeric(5,2) DEFAULT 0 NOT NULL,
  amount numeric(14,2) NOT NULL,
  hsn_code text
);
