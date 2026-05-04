-- Per–catalog-item beneficiary needs (needed flag, qty, notes)
CREATE TABLE "BeneficiaryItemNeed" (
    "id" TEXT NOT NULL,
    "beneficiaryId" TEXT NOT NULL,
    "aidCategoryItemId" TEXT NOT NULL,
    "needed" BOOLEAN NOT NULL DEFAULT false,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BeneficiaryItemNeed_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BeneficiaryItemNeed_beneficiaryId_aidCategoryItemId_key" ON "BeneficiaryItemNeed"("beneficiaryId", "aidCategoryItemId");

CREATE INDEX "BeneficiaryItemNeed_beneficiaryId_idx" ON "BeneficiaryItemNeed"("beneficiaryId");

CREATE INDEX "BeneficiaryItemNeed_aidCategoryItemId_idx" ON "BeneficiaryItemNeed"("aidCategoryItemId");

ALTER TABLE "BeneficiaryItemNeed" ADD CONSTRAINT "BeneficiaryItemNeed_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "Beneficiary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BeneficiaryItemNeed" ADD CONSTRAINT "BeneficiaryItemNeed_aidCategoryItemId_fkey" FOREIGN KEY ("aidCategoryItemId") REFERENCES "AidCategoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
