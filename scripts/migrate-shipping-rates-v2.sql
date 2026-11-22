-- Delivery rates v2 (lib/delivery/rate-engine.ts).
-- District/state for each PIN, looked up from Delhivery once and kept.
CREATE TABLE IF NOT EXISTS pin_locations (
  pin text PRIMARY KEY,
  district text,
  state text,
  source text NOT NULL DEFAULT 'delhivery',
  fetched_at timestamptz NOT NULL DEFAULT now()
);
-- "North, Central & Rest of India" was the fallback for any place not matched; with no
-- destination it is now explicitly the default rule (same prices).
UPDATE shipping_rates SET states = '', updated_at = now()
WHERE zone_name ILIKE '%rest of india%' AND coalesce(pincodes, '') = '' AND coalesce(districts, '') = '';
