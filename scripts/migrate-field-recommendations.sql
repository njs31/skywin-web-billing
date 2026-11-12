CREATE TABLE IF NOT EXISTS field_recommendations (
  id serial PRIMARY KEY,
  crop text NOT NULL,
  stage text NOT NULL DEFAULT '',
  problem text NOT NULL,
  note text NOT NULL DEFAULT '',
  product_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  author_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  author_name text NOT NULL,
  author_role text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS field_recommendations_crop_idx ON field_recommendations (crop);
