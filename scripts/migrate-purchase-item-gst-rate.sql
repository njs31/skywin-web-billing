-- Add GST rate on purchase line items for purchase bill print / totals
ALTER TABLE purchase_items
  ADD COLUMN IF NOT EXISTS gst_rate numeric(5, 2) NOT NULL DEFAULT 0;
