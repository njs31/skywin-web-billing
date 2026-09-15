-- Distinct from ewb_valid_until (transport validity): the e-way bill's
-- 24h cancellation window is measured from when it was generated, not
-- from when its transport validity expires.
alter table sales add column if not exists ewb_generated_at timestamp;
