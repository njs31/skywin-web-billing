-- Receipt voucher series, product edit changelog, credit-note e-invoice.
-- Additive only: existing receipts keep printed RCP-{id} fallback.

alter table party_payments add column if not exists voucher_no text;

create unique index if not exists party_payments_voucher_no_idx
  on party_payments (voucher_no)
  where voucher_no is not null;

alter table sale_returns add column if not exists igst numeric(14, 2) default 0 not null;
alter table sale_returns add column if not exists einvoice_status text default 'none' not null;
alter table sale_returns add column if not exists irn text;
alter table sale_returns add column if not exists ack_no text;
alter table sale_returns add column if not exists ack_date timestamp;
alter table sale_returns add column if not exists signed_qr text;
alter table sale_returns add column if not exists einvoice_error text;
alter table sale_returns add column if not exists einvoice_raw text;

create table if not exists product_change_logs (
  id serial primary key,
  product_id integer not null references products(id),
  user_id integer references users(id),
  user_name text not null,
  changed_at timestamp not null default now(),
  summary text not null
);

create index if not exists product_change_logs_product_id_idx
  on product_change_logs (product_id);
