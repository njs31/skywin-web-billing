-- Line discount on sales return (credit note) items.
-- Safe to re-run.

ALTER TABLE sale_return_items
  ADD COLUMN IF NOT EXISTS discount_percent numeric(5,2) DEFAULT 0 NOT NULL;

ALTER TABLE sale_return_items
  ADD COLUMN IF NOT EXISTS discount_type text DEFAULT 'percent' NOT NULL;

ALTER TABLE sale_return_items
  ADD COLUMN IF NOT EXISTS discount_value numeric(14,2) DEFAULT 0 NOT NULL;
