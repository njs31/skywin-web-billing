create table if not exists activity_logs (
  id serial primary key,
  user_id integer references users(id),
  user_name text not null,
  action text not null,
  message text not null,
  entity_type text,
  entity_id integer,
  created_at timestamp not null default now()
);

create index if not exists activity_logs_created_at_idx on activity_logs (created_at);
create index if not exists activity_logs_user_id_idx on activity_logs (user_id);
