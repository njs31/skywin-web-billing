-- Store GST % on purchase order lines for print (totals stay exclusive).
-- Safe to re-run.

ALTER TABLE purchase_order_items
  ADD COLUMN IF NOT EXISTS gst_rate numeric(5,2) DEFAULT 0 NOT NULL;

UPDATE purchase_order_items poi
SET gst_rate = p.gst_rate
FROM products p
WHERE poi.product_id = p.id
  AND (poi.gst_rate IS NULL OR poi.gst_rate = 0)
  AND p.gst_rate IS NOT NULL;
