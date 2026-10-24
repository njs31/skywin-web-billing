-- Tables and columns the SkyWin Field admin reads. Existing billing
-- customers stay as they are; new columns only add field-officer details.

alter table customers add column if not exists alt_phone text;
alter table customers add column if not exists language text default 'en';
alter table customers add column if not exists approval text default 'pending';
alter table customers add column if not exists reward_points integer not null default 0;
alter table customers add column if not exists source text default 'imported';
alter table customers add column if not exists assigned_officer_id integer;
alter table customers add column if not exists photo_url text;
alter table customers add column if not exists payment_mode text default 'upi';

alter table users add column if not exists field_app_access boolean not null default true;

create table if not exists field_categories (
  id serial primary key,
  slug text not null unique,
  title text not null,
  sort_order integer not null default 0,
  queries text[] not null,
  icon_key text not null
);

create table if not exists field_subcategories (
  id serial primary key,
  category_id integer not null references field_categories(id) on delete cascade,
  slug text not null,
  title text not null,
  sort_order integer not null default 0,
  queries text[] not null,
  match_terms text[] not null,
  icon_key text,
  icon_uri text,
  icon_tint boolean not null default true
);

create unique index if not exists field_subcategories_category_slug
  on field_subcategories (category_id, slug);
create index if not exists field_subcategories_category_id_idx
  on field_subcategories (category_id);

create table if not exists field_subcategory_products (
  id serial primary key,
  subcategory_id integer not null references field_subcategories(id) on delete cascade,
  product_id integer not null references products(id) on delete cascade
);

create unique index if not exists field_subcategory_products_unique
  on field_subcategory_products (subcategory_id, product_id);
create index if not exists field_subcategory_products_sub_idx
  on field_subcategory_products (subcategory_id);

create table if not exists farms (
  id serial primary key,
  customer_id integer not null references customers(id) on delete cascade,
  name text not null,
  crop text,
  acres numeric(10, 2) not null default 0,
  gps text,
  address text,
  pin text,
  validated boolean not null default false,
  created_at timestamp not null default now()
);

create index if not exists farms_customer_id_idx on farms (customer_id);

create table if not exists field_product_details (
  product_id integer primary key references products(id) on delete cascade,
  display_name text,
  images jsonb not null default '[]'::jsonb,
  brochure_url text,
  active_ingredient text,
  pack_sizes text,
  headline text,
  description text,
  antidote text,
  usage jsonb not null default '[]'::jsonb,
  videos jsonb not null default '[]'::jsonb,
  updated_at timestamp not null default now()
);

create table if not exists field_media (
  id text primary key,
  mime text not null,
  size integer not null,
  data bytea not null,
  created_at timestamp not null default now()
);
