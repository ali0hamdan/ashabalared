-- Per-category need quantity on beneficiary
ALTER TABLE "BeneficiaryCategory" ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1;
