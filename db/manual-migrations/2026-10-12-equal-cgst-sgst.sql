-- Odd-paisa GST used to leave SGST one paisa below CGST. Both halves are now
-- the same rounded value. The invoice total does not move: the stray paisa
-- is taken from or added to round-off. Interstate bills (IGST only) are left
-- alone.

UPDATE sales AS s
SET
  cgst = h.half,
  sgst = h.half,
  round_off = round(s.round_off - (h.half * 2 - (s.cgst + s.sgst)), 2)
FROM (
  SELECT id, round(((cgst + sgst) / 2)::numeric, 2) AS half
  FROM sales
  WHERE igst = 0
    AND cgst <> sgst
) AS h
WHERE s.id = h.id;

UPDATE quotations AS q
SET
  cgst = h.half,
  sgst = h.half,
  round_off = round(q.round_off - (h.half * 2 - (q.cgst + q.sgst)), 2)
FROM (
  SELECT id, round(((cgst + sgst) / 2)::numeric, 2) AS half
  FROM quotations
  WHERE igst = 0
    AND cgst <> sgst
) AS h
WHERE q.id = h.id;
