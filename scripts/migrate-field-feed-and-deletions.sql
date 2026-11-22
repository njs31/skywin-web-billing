-- In-app notification feed holds every push, not only order updates.
ALTER TABLE order_notifications ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE order_notifications ADD COLUMN IF NOT EXISTS url text;

-- Farmer account deletion requests, approved by an admin on /field/deletions.
CREATE TABLE IF NOT EXISTS field_deletion_requests (
  id serial PRIMARY KEY,
  phone text NOT NULL,
  name text,
  village text,
  customer_ids integer[] NOT NULL DEFAULT '{}'::integer[],
  status text NOT NULL DEFAULT 'pending',
  requested_at timestamp NOT NULL DEFAULT now(),
  decided_at timestamp,
  decided_by text
);
CREATE INDEX IF NOT EXISTS field_deletion_requests_status_idx ON field_deletion_requests (status);
CREATE INDEX IF NOT EXISTS field_deletion_requests_phone_idx ON field_deletion_requests (phone);
