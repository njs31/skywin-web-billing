create table if not exists label_prints (
  id serial primary key,
  product_id integer references products(id),
  label_count integer not null,
  source text not null,
  created_at timestamp not null default now()
);
create index if not exists label_prints_created_at_idx on label_prints (created_at);
