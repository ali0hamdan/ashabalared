-- Optional per-category notes on beneficiary needs
ALTER TABLE "BeneficiaryCategory" ADD COLUMN IF NOT EXISTS "notes" TEXT;
