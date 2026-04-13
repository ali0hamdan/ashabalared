-- Beneficiary: rename family count column
ALTER TABLE "Beneficiary" RENAME COLUMN "familyMemberCount" TO "familyCount";

-- BeneficiaryNeed -> BeneficiaryCategory
DROP INDEX IF EXISTS "BeneficiaryNeed_beneficiaryId_aidCategoryId_key";
ALTER TABLE "BeneficiaryNeed" DROP CONSTRAINT IF EXISTS "BeneficiaryNeed_aidCategoryId_fkey";
ALTER TABLE "BeneficiaryNeed" RENAME TO "BeneficiaryCategory";
ALTER TABLE "BeneficiaryCategory" RENAME COLUMN "aidCategoryId" TO "categoryId";
ALTER TABLE "BeneficiaryCategory" ADD CONSTRAINT "BeneficiaryCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "AidCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "BeneficiaryCategory_beneficiaryId_categoryId_key" ON "BeneficiaryCategory"("beneficiaryId", "categoryId");

-- AidCategoryItem: catalog fields
ALTER TABLE "AidCategoryItem" ADD COLUMN "name" TEXT;
ALTER TABLE "AidCategoryItem" ADD COLUMN "defaultQuantity" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "AidCategoryItem" ADD COLUMN "unit" "StockUnit" NOT NULL DEFAULT 'PIECE';
UPDATE "AidCategoryItem" SET "name" = "nameAr" WHERE "name" IS NULL;
ALTER TABLE "AidCategoryItem" ALTER COLUMN "name" SET NOT NULL;
ALTER TABLE "AidCategoryItem" DROP COLUMN "nameAr";
ALTER TABLE "AidCategoryItem" DROP COLUMN "nameEn";

-- AidCategory: name, description, isActive
DROP INDEX IF EXISTS "AidCategory_slug_key";
ALTER TABLE "AidCategory" ADD COLUMN "name" TEXT;
ALTER TABLE "AidCategory" ADD COLUMN "description" TEXT;
ALTER TABLE "AidCategory" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
UPDATE "AidCategory" SET "name" = COALESCE(NULLIF(TRIM("nameAr"), ''), "slug"), "isActive" = ("archivedAt" IS NULL), "description" = NULL;
ALTER TABLE "AidCategory" ALTER COLUMN "name" SET NOT NULL;
CREATE UNIQUE INDEX "AidCategory_name_key" ON "AidCategory"("name");
ALTER TABLE "AidCategory" DROP COLUMN "nameAr";
ALTER TABLE "AidCategory" DROP COLUMN "nameEn";
ALTER TABLE "AidCategory" DROP COLUMN "slug";
ALTER TABLE "AidCategory" DROP COLUMN "archivedAt";

-- StockItem: one row per catalog item
ALTER TABLE "StockItem" ADD COLUMN "aidCategoryItemId" TEXT;
UPDATE "StockItem" s
SET "aidCategoryItemId" = (
  SELECT i.id
  FROM "AidCategoryItem" i
  WHERE i."aidCategoryId" = s."aidCategoryId"
  ORDER BY i."sortOrder" ASC, i.id ASC
  LIMIT 1
);
ALTER TABLE "StockItem" ALTER COLUMN "aidCategoryItemId" SET NOT NULL;
CREATE UNIQUE INDEX "StockItem_aidCategoryItemId_key" ON "StockItem"("aidCategoryItemId");
ALTER TABLE "StockItem" DROP CONSTRAINT "StockItem_aidCategoryId_fkey";
ALTER TABLE "StockItem" DROP COLUMN "aidCategoryId";
ALTER TABLE "StockItem" DROP COLUMN "nameAr";
ALTER TABLE "StockItem" DROP COLUMN "nameEn";
ALTER TABLE "StockItem" DROP COLUMN "unit";
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_aidCategoryItemId_fkey" FOREIGN KEY ("aidCategoryItemId") REFERENCES "AidCategoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DistributionRecord: createdBy
ALTER TABLE "DistributionRecord" DROP CONSTRAINT "DistributionRecord_preparedById_fkey";
ALTER TABLE "DistributionRecord" RENAME COLUMN "preparedById" TO "createdById";
ALTER TABLE "DistributionRecord" ADD CONSTRAINT "DistributionRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DistributionStatus: collapse to PENDING / DELIVERED / CANCELLED
ALTER TABLE "DistributionRecord" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "DistributionRecord" ALTER COLUMN "status" TYPE TEXT USING ("status"::TEXT);
UPDATE "DistributionRecord" SET "status" = 'PENDING' WHERE "status" IN ('ASSIGNED', 'OUT_FOR_DELIVERY');
UPDATE "StockItem" SET "quantityReserved" = 0;
DROP TYPE "DistributionStatus";
CREATE TYPE "DistributionStatus" AS ENUM ('PENDING', 'DELIVERED', 'CANCELLED');
ALTER TABLE "DistributionRecord" ALTER COLUMN "status" TYPE "DistributionStatus" USING ("status"::"DistributionStatus");
ALTER TABLE "DistributionRecord" ALTER COLUMN "status" SET DEFAULT 'PENDING'::"DistributionStatus";
