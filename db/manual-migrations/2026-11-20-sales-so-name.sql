-- Wholesale bills: sales officer name ("SO Name"), Raja 20 Nov 2026.
-- Additive and nullable; existing bills and other bill types keep NULL.
set lock_timeout = '5s';
alter table sales add column if not exists so_name text;
