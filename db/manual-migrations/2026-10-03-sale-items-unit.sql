-- Per-line unit for custom (non-inventory) sale lines, which have no
-- product row to inherit a unit from. Product lines keep resolving via
-- products.unit; this column only carries the cashier-chosen unit for
-- custom lines (and future overrides). Purely additive: existing rows read
-- NULL, which the e-invoice path reports as "missing unit" as before.
alter table sale_items add column if not exists unit text;
