-- Officer names and the original Field app ids for the imported farmer directory.

alter table customers add column if not exists field_officer_name text;
alter table customers add column if not exists field_external_id text;

create unique index if not exists customers_field_external_id_uk
  on customers (field_external_id)
  where field_external_id is not null;

create index if not exists customers_type_name_idx on customers (type, name);
