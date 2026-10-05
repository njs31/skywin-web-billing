-- URP / unregistered placeholders are not an identity. The old unique
-- index on customers.gstin allowed only one row with gstin = 'URP', so
-- the next unregistered bill reused that customer (name, address, last
-- invoice). Uniqueness stays only for real 15-character GSTINs.
DROP INDEX IF EXISTS customers_gstin_unique;
CREATE UNIQUE INDEX customers_gstin_unique
  ON customers (gstin)
  WHERE gstin IS NOT NULL
    AND char_length(btrim(gstin)) = 15;
