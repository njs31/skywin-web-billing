-- Skywin 17-item punch-list, Phase 4 — enum change (item 11).
-- MUST run outside a transaction, BEFORE deploying the Phase 4 app build.
ALTER TYPE bill_type ADD VALUE IF NOT EXISTS 'others';
