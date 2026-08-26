-- Purchase orders are supplier documents, not customer documents.
-- Safe to re-run.

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS supplier_id integer REFERENCES suppliers(id);

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS supplier_name text;

CREATE INDEX IF NOT EXISTS purchase_orders_supplier_id_idx
  ON purchase_orders (supplier_id);
