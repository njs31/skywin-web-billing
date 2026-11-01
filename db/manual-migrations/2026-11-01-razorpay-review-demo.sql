-- Dummy customer, dealer login, and two sample bills for the website review.
-- The reviewer phone signs in with REVIEWER_PASSWORD and only sees this customer.

insert into customers (name, phone, address, type, credit_limit, approval, source)
select
  'Razorpay Review',
  '9000000001',
  'Sample address for website review',
  'retail',
  0,
  'approved',
  'review'
where not exists (
  select 1 from customers where phone = '9000000001' and name = 'Razorpay Review'
);

insert into users (name, phone, role, customer_id, field_app_access)
select 'Razorpay Review', '9000000001', 'dealer', c.id, false
from customers c
where c.phone = '9000000001'
  and c.name = 'Razorpay Review'
  and not exists (select 1 from users where phone = '9000000001');

insert into products (name, sku, unit, purchase_rate, sale_rate, mrp, stock_qty, reorder_level, hsn_code, gst_rate, is_active)
select 'Demo Mosquito Coil', 'DEMO-RP-001', 'pcs', 40, 100, 120, 25, 5, '38089199', 18, true
where not exists (select 1 from products where sku = 'DEMO-RP-001');

insert into products (name, sku, unit, purchase_rate, sale_rate, mrp, stock_qty, reorder_level, hsn_code, gst_rate, is_active)
select 'Demo Liquid Vaporizer', 'DEMO-RP-002', 'pcs', 20, 50, 70, 40, 5, '38089199', 18, true
where not exists (select 1 from products where sku = 'DEMO-RP-002');

insert into products (name, sku, unit, purchase_rate, sale_rate, mrp, stock_qty, reorder_level, hsn_code, gst_rate, is_active)
select 'Demo Vaporizer Machine', 'DEMO-RP-003', 'pcs', 80, 250, 299, 10, 2, '85167990', 18, true
where not exists (select 1 from products where sku = 'DEMO-RP-003');

insert into sales (
  invoice_no, date, bill_type, customer_id, customer_name, payment_mode,
  operator_name, subtotal, discount_amount, cgst, sgst, igst, grand_total,
  round_off, paid_amount, cash_amount, upi_amount, notes, status
)
select
  'DEMO/0001/26-27', now(), 'retail', c.id, c.name, 'cash',
  'Review', 100, 0, 9, 9, 0, 118,
  0, 118, 118, 0, 'Razorpay website review — dummy bill', 'active'
from customers c
where c.phone = '9000000001'
  and c.name = 'Razorpay Review'
  and not exists (select 1 from sales where invoice_no = 'DEMO/0001/26-27');

insert into sale_items (
  sale_id, product_id, qty, rate, discount_percent, discount_type, discount_value,
  gst_rate, amount, hsn_code, unit
)
select s.id, p.id, 1, 100, 0, 'percent', 0, 18, 100, '38089199', 'pcs'
from sales s
join products p on p.sku = 'DEMO-RP-001'
where s.invoice_no = 'DEMO/0001/26-27'
  and not exists (select 1 from sale_items si where si.sale_id = s.id);

insert into sales (
  invoice_no, date, bill_type, customer_id, customer_name, payment_mode,
  operator_name, subtotal, discount_amount, cgst, sgst, igst, grand_total,
  round_off, paid_amount, cash_amount, upi_amount, notes, status
)
select
  'DEMO/0002/26-27', now(), 'retail', c.id, c.name, 'credit',
  'Review', 100, 0, 9, 9, 0, 118,
  0, 0, 0, 0, 'Razorpay website review — dummy bill', 'active'
from customers c
where c.phone = '9000000001'
  and c.name = 'Razorpay Review'
  and not exists (select 1 from sales where invoice_no = 'DEMO/0002/26-27');

insert into sale_items (
  sale_id, product_id, qty, rate, discount_percent, discount_type, discount_value,
  gst_rate, amount, hsn_code, unit
)
select s.id, p.id, 2, 50, 0, 'percent', 0, 18, 100, '38089199', 'pcs'
from sales s
join products p on p.sku = 'DEMO-RP-002'
where s.invoice_no = 'DEMO/0002/26-27'
  and not exists (select 1 from sale_items si where si.sale_id = s.id);
