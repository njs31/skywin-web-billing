ALTER TABLE field_product_details
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS instructions text,
  ADD COLUMN IF NOT EXISTS crops text,
  ADD COLUMN IF NOT EXISTS min_order_qty numeric(14,2),
  ADD COLUMN IF NOT EXISTS max_order_qty numeric(14,2);
