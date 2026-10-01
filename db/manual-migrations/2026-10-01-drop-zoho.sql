-- Zoho is gone for good: WhiteBooks is the GSP for e-Invoice/e-Way Bill.
-- Drop the dead Zoho columns, and wipe the stale Zoho failure text (plus
-- the failed statuses it left behind) so both pages show live state.
-- Rows that actually pushed something (irn / ewb_no present) are untouched.
alter table sales drop column if exists zoho_sync_error;
alter table customers drop column if exists zoho_contact_id;

update sales
  set ewb_error = null, ewb_status = 'none'
  where ewb_no is null and ewb_error like 'Zoho%';

update sales
  set einvoice_error = null, einvoice_status = 'none'
  where irn is null and einvoice_error like 'Zoho%';
