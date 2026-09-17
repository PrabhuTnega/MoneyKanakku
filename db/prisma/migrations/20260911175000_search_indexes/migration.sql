-- Backs search.html's "search transactions, categories..." box, which does
-- substring/typo-tolerant matching rather than exact prefix matching — a
-- plain B-tree index on description can't accelerate `ILIKE '%term%'`, but
-- a trigram (pg_trgm) GIN index can.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "transactions_description_trgm_idx"
  ON "transactions" USING GIN ("description" gin_trgm_ops);

-- Category names are short and few (dozens, not millions) per user, so a
-- trigram index would be overkill there — a normal index scan over
-- categories.name is already fast enough at that row count.
