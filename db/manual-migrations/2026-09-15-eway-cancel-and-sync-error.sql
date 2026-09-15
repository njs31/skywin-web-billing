-- Adds:
--   sales.zoho_sync_error  — persists a failed initial Zoho invoice sync
--                            (auto-on-checkout or manual retry), separate
--                            from einvoice_error/ewb_error which are about
--                            the later IRN/e-way-bill push.
--   sales.ewb_id           — Zoho's internal ewaybill_id, needed to
--                            cancel/extend an e-way bill via the API.
alter table sales add column if not exists zoho_sync_error text;
alter table sales add column if not exists ewb_id text;
