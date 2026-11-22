-- In-app notification feed holds every push, not only order updates.
ALTER TABLE order_notifications ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE order_notifications ADD COLUMN IF NOT EXISTS url text;
