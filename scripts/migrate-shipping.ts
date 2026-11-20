import { db } from "../db";
import { sql } from "drizzle-orm";

async function runMigration() {
  console.log("Running shipping schema migration...");

  // 1. shipping_settings
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS shipping_settings (
      id SERIAL PRIMARY KEY,
      provider TEXT NOT NULL DEFAULT 'manual', -- 'manual' or 'delhivery'
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_by TEXT
    );
  `);

  // Insert default setting if empty
  await db.execute(sql`
    INSERT INTO shipping_settings (id, provider, updated_at, updated_by)
    VALUES (1, 'manual', NOW(), 'system')
    ON CONFLICT (id) DO NOTHING;
  `);

  // Also sync to general settings table if present
  await db.execute(sql`
    INSERT INTO settings (key, value)
    VALUES ('shipping_provider', 'manual')
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  `);

  // 2. shipping_rates
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS shipping_rates (
      id SERIAL PRIMARY KEY,
      slab TEXT NOT NULL, -- e.g. '250gm-500gm', '500 to 1kg'
      min_weight_grams INTEGER NOT NULL DEFAULT 0,
      max_weight_grams INTEGER NOT NULL DEFAULT 1000,
      zone_name TEXT NOT NULL,
      regions TEXT NOT NULL,
      transit_days TEXT NOT NULL DEFAULT '3 - 5 Days',
      shipping_fee NUMERIC(10, 2) NOT NULL DEFAULT 0,
      pincodes TEXT, -- comma-separated PINs
      districts TEXT, -- comma-separated lowercase districts
      states TEXT, -- comma-separated lowercase states
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  // 3. order_checkpoints
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS order_checkpoints (
      id SERIAL PRIMARY KEY,
      order_id TEXT NOT NULL,
      sale_id INTEGER REFERENCES sales(id) ON DELETE SET NULL,
      checkpoint TEXT NOT NULL,
      note TEXT,
      location TEXT,
      updated_by TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS order_checkpoints_order_id_idx ON order_checkpoints(order_id);
    CREATE INDEX IF NOT EXISTS order_checkpoints_created_at_idx ON order_checkpoints(created_at);
  `);

  // 4. push_tokens
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS push_tokens (
      id SERIAL PRIMARY KEY,
      phone TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      platform TEXT DEFAULT 'android',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS push_tokens_phone_idx ON push_tokens(phone);
  `);

  // 5. order_notifications
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS order_notifications (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      phone TEXT,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      checkpoint TEXT,
      read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS order_notifications_order_id_idx ON order_notifications(order_id);
    CREATE INDEX IF NOT EXISTS order_notifications_phone_idx ON order_notifications(phone);
  `);

  console.log("Shipping migration completed successfully!");
}

runMigration()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
