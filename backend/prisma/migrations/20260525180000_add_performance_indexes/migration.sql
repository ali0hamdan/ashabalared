-- Performance indexes for list/search/filter/sort/join paths (additive only).
-- Existing indexes from 20260507000000_list_query_indexes are unchanged.

-- Beneficiary: sort by createdAt; active + area filters (delivery by area, not-received)
CREATE INDEX IF NOT EXISTS "Beneficiary_createdAt_idx" ON "Beneficiary" ("createdAt");
CREATE INDEX IF NOT EXISTS "Beneficiary_status_area_idx" ON "Beneficiary" ("status", "area");

-- Beneficiary needs: category filter (not-received), lookups by beneficiary
CREATE INDEX IF NOT EXISTS "BeneficiaryCategory_categoryId_idx" ON "BeneficiaryCategory" ("categoryId");
CREATE INDEX IF NOT EXISTS "BeneficiaryCategory_beneficiaryId_idx" ON "BeneficiaryCategory" ("beneficiaryId");

CREATE INDEX IF NOT EXISTS "BeneficiaryItemNeed_needed_idx" ON "BeneficiaryItemNeed" ("needed");
CREATE INDEX IF NOT EXISTS "BeneficiaryItemNeed_beneficiaryId_needed_idx" ON "BeneficiaryItemNeed" ("beneficiaryId", "needed");

CREATE INDEX IF NOT EXISTS "BeneficiaryTimelineEvent_beneficiaryId_idx" ON "BeneficiaryTimelineEvent" ("beneficiaryId");
CREATE INDEX IF NOT EXISTS "BeneficiaryTimelineEvent_beneficiaryId_createdAt_idx" ON "BeneficiaryTimelineEvent" ("beneficiaryId", "createdAt");

-- Aid catalog
CREATE INDEX IF NOT EXISTS "AidCategory_isActive_idx" ON "AidCategory" ("isActive");
CREATE INDEX IF NOT EXISTS "AidCategoryItem_aidCategoryId_idx" ON "AidCategoryItem" ("aidCategoryId");
CREATE INDEX IF NOT EXISTS "AidCategoryItem_aidCategoryId_sortOrder_idx" ON "AidCategoryItem" ("aidCategoryId", "sortOrder");

-- Stock
CREATE INDEX IF NOT EXISTS "StockItem_quantityOnHand_idx" ON "StockItem" ("quantityOnHand");

CREATE INDEX IF NOT EXISTS "StockMovement_stockItemId_idx" ON "StockMovement" ("stockItemId");
CREATE INDEX IF NOT EXISTS "StockMovement_stockItemId_createdAt_idx" ON "StockMovement" ("stockItemId", "createdAt");
CREATE INDEX IF NOT EXISTS "StockMovement_referenceType_referenceId_idx" ON "StockMovement" ("referenceType", "referenceId");

-- Distribution: weekly tracking, dashboard, not-received, delivery lists
CREATE INDEX IF NOT EXISTS "DistributionRecord_completedById_idx" ON "DistributionRecord" ("completedById");
CREATE INDEX IF NOT EXISTS "DistributionRecord_deliveredAt_idx" ON "DistributionRecord" ("deliveredAt");
CREATE INDEX IF NOT EXISTS "DistributionRecord_cancelledAt_idx" ON "DistributionRecord" ("cancelledAt");
CREATE INDEX IF NOT EXISTS "DistributionRecord_status_deliveredAt_idx" ON "DistributionRecord" ("status", "deliveredAt");
CREATE INDEX IF NOT EXISTS "DistributionRecord_beneficiaryId_status_idx" ON "DistributionRecord" ("beneficiaryId", "status");
CREATE INDEX IF NOT EXISTS "DistributionRecord_assignedDeliveryUserId_status_idx" ON "DistributionRecord" ("assignedDeliveryUserId", "status");

CREATE INDEX IF NOT EXISTS "DistributionRecordItem_distributionRecordId_idx" ON "DistributionRecordItem" ("distributionRecordId");
CREATE INDEX IF NOT EXISTS "DistributionRecordItem_aidCategoryId_idx" ON "DistributionRecordItem" ("aidCategoryId");
CREATE INDEX IF NOT EXISTS "DistributionRecordItem_aidCategoryItemId_idx" ON "DistributionRecordItem" ("aidCategoryItemId");
CREATE INDEX IF NOT EXISTS "DistributionRecordItem_stockItemId_idx" ON "DistributionRecordItem" ("stockItemId");
CREATE INDEX IF NOT EXISTS "DistributionRecordItem_distributionRecordId_aidCategoryId_idx" ON "DistributionRecordItem" ("distributionRecordId", "aidCategoryId");

CREATE INDEX IF NOT EXISTS "DeliveryAssignment_distributionRecordId_idx" ON "DeliveryAssignment" ("distributionRecordId");
CREATE INDEX IF NOT EXISTS "DeliveryAssignment_deliveryUserId_idx" ON "DeliveryAssignment" ("deliveryUserId");

-- Users & auth
CREATE INDEX IF NOT EXISTS "User_roleId_idx" ON "User" ("roleId");
CREATE INDEX IF NOT EXISTS "User_isActive_idx" ON "User" ("isActive");

CREATE INDEX IF NOT EXISTS "RefreshToken_userId_idx" ON "RefreshToken" ("userId");
CREATE INDEX IF NOT EXISTS "RefreshToken_expiresAt_idx" ON "RefreshToken" ("expiresAt");

-- Audit log
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog" ("createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_actorUserId_idx" ON "AuditLog" ("actorUserId");
CREATE INDEX IF NOT EXISTS "AuditLog_action_idx" ON "AuditLog" ("action");
CREATE INDEX IF NOT EXISTS "AuditLog_entityType_entityId_idx" ON "AuditLog" ("entityType", "entityId");
