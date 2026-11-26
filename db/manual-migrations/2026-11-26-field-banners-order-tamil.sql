-- Raja 24 Nov + 26 Nov 2026: product order in subcategories, Tamil product details,
-- "View product" on notifications, and carousel banners for the Field app.
-- Additive only (new columns with defaults and a new table); safe to run twice.

alter table field_subcategory_products add column if not exists sort_order integer not null default 0;

-- Keep today's order on the dashboard (A to Z by product name) as the starting positions.
update field_subcategory_products l
set sort_order = r.pos
from (
  select l2.id, row_number() over (partition by l2.subcategory_id order by lower(p.name), l2.id) as pos
  from field_subcategory_products l2
  join products p on p.id = l2.product_id
) r
where r.id = l.id
  and not exists (select 1 from field_subcategory_products x where x.sort_order <> 0);

alter table field_product_details
  add column if not exists display_name_ta text,
  add column if not exists active_ingredient_ta text,
  add column if not exists pack_sizes_ta text,
  add column if not exists headline_ta text,
  add column if not exists description_ta text,
  add column if not exists antidote_ta text,
  add column if not exists instructions_ta text;

alter table field_broadcasts add column if not exists product_id integer references products(id) on delete set null;

create table if not exists field_banners (
  id serial primary key,
  image_url text not null,
  placement text not null default 'products',
  category_id integer references field_categories(id) on delete cascade,
  product_id integer references products(id) on delete set null,
  title text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_by text,
  created_at timestamp not null default now()
);
create index if not exists field_banners_placement_idx on field_banners (placement, category_id);
