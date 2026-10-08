-- SA7 TWO ROW PADDY WEEDER WITH FLOAT - 4STROKE was marked inactive.
-- Match id and sku together so a different product is never flipped.
UPDATE products
SET is_active = true
WHERE id = 921
  AND sku = '10000921'
  AND is_active = false;
