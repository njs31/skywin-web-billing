-- Follow-up to 2026-10-01-drop-zoho.sql: two more dead Zoho columns
-- found on sales (ids cached from Zoho Books contacts/invoices).
alter table sales drop column if exists zoho_invoice_id;
alter table sales drop column if exists zoho_contact_id;
