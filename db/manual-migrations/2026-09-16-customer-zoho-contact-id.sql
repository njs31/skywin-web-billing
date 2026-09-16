-- Caches the Zoho Books contact id for an unregistered ("consumer")
-- customer, since one can't be re-found by gst_no like a B2B contact —
-- without this, every sync for the same unregistered customer would
-- create a fresh duplicate Zoho contact.
alter table customers add column if not exists zoho_contact_id text;
