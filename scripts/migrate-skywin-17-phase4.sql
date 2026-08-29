-- Skywin 17-item punch-list, Phase 4 schema (item 3). Additive; safe to re-run.
ALTER TABLE product_batches
  ADD COLUMN IF NOT EXISTS sale_rate_overridden boolean DEFAULT false NOT NULL;

-- Treat any batch whose sale rate already differs from its product's as
-- hand-set, so the first product-rate edit after this migration does not
-- silently reset it.
UPDATE product_batches pb
SET sale_rate_overridden = true
FROM products p
WHERE pb.product_id = p.id
  AND pb.sale_rate IS NOT NULL
  AND pb.sale_rate::numeric IS DISTINCT FROM p.sale_rate::numeric
  AND pb.sale_rate_overridden = false;
