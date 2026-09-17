-- CreateIndex
CREATE INDEX "transactions_description_trgm_idx" ON "transactions" USING GIN ("description" gin_trgm_ops);
