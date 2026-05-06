-- Support filter/sort and search on list endpoints
CREATE INDEX IF NOT EXISTS "Beneficiary_deletedAt_status_idx" ON "Beneficiary" ("deletedAt", "status");
CREATE INDEX IF NOT EXISTS "Beneficiary_fullName_idx" ON "Beneficiary" ("fullName");
CREATE INDEX IF NOT EXISTS "Beneficiary_phone_idx" ON "Beneficiary" ("phone");
CREATE INDEX IF NOT EXISTS "Beneficiary_area_idx" ON "Beneficiary" ("area");
CREATE INDEX IF NOT EXISTS "Beneficiary_status_idx" ON "Beneficiary" ("status");

CREATE INDEX IF NOT EXISTS "DistributionRecord_status_idx" ON "DistributionRecord" ("status");
CREATE INDEX IF NOT EXISTS "DistributionRecord_beneficiaryId_idx" ON "DistributionRecord" ("beneficiaryId");
CREATE INDEX IF NOT EXISTS "DistributionRecord_assignedDeliveryUserId_idx" ON "DistributionRecord" ("assignedDeliveryUserId");
CREATE INDEX IF NOT EXISTS "DistributionRecord_createdById_idx" ON "DistributionRecord" ("createdById");
CREATE INDEX IF NOT EXISTS "DistributionRecord_createdAt_idx" ON "DistributionRecord" ("createdAt" DESC);
