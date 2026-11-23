-- Field dashboard v3 (2026-11-23): product On/Off in the app, category icons,
-- push language per phone, and manager notifications (broadcasts).
-- Safe to run more than once.

-- 4. Each listed product can be switched off in the app without unlisting it.
ALTER TABLE field_listed_products ADD COLUMN IF NOT EXISTS app_visible boolean NOT NULL DEFAULT true;

-- 5. Categories can have an uploaded icon (sub-categories already have icon_uri).
ALTER TABLE field_categories ADD COLUMN IF NOT EXISTS icon_uri text;

-- 6. The app's language on each phone, so a push heading arrives in that language.
ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS language text;

-- 6. Notifications a manager sends to every app user from the Field dashboard.
CREATE TABLE IF NOT EXISTS field_broadcasts (
  id text PRIMARY KEY,
  title_en text NOT NULL,
  title_ta text,
  body_en text NOT NULL DEFAULT '',
  body_ta text,
  image_url text,
  link_url text,
  video_url text,
  audience text NOT NULL DEFAULT 'all',
  status text NOT NULL DEFAULT 'sending',
  devices integer NOT NULL DEFAULT 0,
  delivered integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  created_by text,
  created_at timestamp NOT NULL DEFAULT now(),
  sent_at timestamp
);
CREATE INDEX IF NOT EXISTS field_broadcasts_created_at_idx ON field_broadcasts (created_at DESC);
