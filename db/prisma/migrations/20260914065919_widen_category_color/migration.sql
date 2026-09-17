-- DropIndex
DROP INDEX "transactions_description_trgm_idx";

-- AlterTable
ALTER TABLE "categories" ALTER COLUMN "color" SET DATA TYPE VARCHAR(40);
