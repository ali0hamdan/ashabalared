-- Quantity mode per Aid Category (where the quantity is entered).
-- Existing categories default to CATEGORY_LEVEL so current data keeps working.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AidCategoryQuantityMode') THEN
    CREATE TYPE "AidCategoryQuantityMode" AS ENUM ('CATEGORY_LEVEL', 'ITEM_LEVEL');
  END IF;
END
$$;

ALTER TABLE "AidCategory"
  ADD COLUMN IF NOT EXISTS "quantityMode" "AidCategoryQuantityMode" NOT NULL DEFAULT 'CATEGORY_LEVEL';
