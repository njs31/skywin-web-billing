-- Purchase bills: handling as ₹ or %, GST on handling, and rupee round-off.
-- Additive only; safe to re-run. Must be applied BEFORE deploying the code
-- that reads these columns, or purchase pages will error.

ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS handling_charge_type  text          NOT NULL DEFAULT 'value',
  ADD COLUMN IF NOT EXISTS handling_charge_value numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS handling_gst_rate     numeric(5,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS handling_gst          numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS round_off             numeric(14,2) NOT NULL DEFAULT 0;

-- Existing bills entered handling as a rupee amount; carry it into the new
-- "as entered" column so the edit form shows it. Nothing else is recomputed —
-- saved totals on old bills are left exactly as they were.
UPDATE purchases
   SET handling_charge_value = handling_charges
 WHERE handling_charge_value = 0
   AND handling_charges > 0;
