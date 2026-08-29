-- Skywin 17-item punch-list, Phase 3 schema (items 4, 8, 9, 14).
-- Additive only; safe to re-run.

-- Item 9: retail dispatch fields (transporter name; vehicle_no / dispatched_through already exist)
ALTER TABLE sales ADD COLUMN IF NOT EXISTS transporter_name text;

-- Item 4: idempotent external-order ingestion (QwicksApp)
ALTER TABLE sales ADD COLUMN IF NOT EXISTS external_order_id text;
CREATE UNIQUE INDEX IF NOT EXISTS sales_external_order_id_uk
  ON sales (external_order_id) WHERE external_order_id IS NOT NULL;

-- Item 8: per-invoice e-invoice / QR flag
ALTER TABLE sales ADD COLUMN IF NOT EXISTS e_invoice_requested boolean DEFAULT false NOT NULL;

-- Item 14: cancellable sales invoices (number kept, reversal handled in app)
ALTER TABLE sales ADD COLUMN IF NOT EXISTS status text DEFAULT 'active' NOT NULL;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS cancelled_at timestamp;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS cancelled_by text;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS cancel_reason text;
CREATE INDEX IF NOT EXISTS sales_status_idx ON sales (status);
