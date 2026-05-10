/** Narrow frontend shapes for API JSON — extend as endpoints evolve */

export type AuditLogRow = {
  id: string;
  createdAt: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  actor?: { displayName?: string | null } | null;
};

export type AuditLogsPayload = {
  items?: AuditLogRow[];
};

export type UserRow = {
  id: string;
  username: string;
  displayName: string;
  isActive: boolean;
  role?: { code?: string | null } | null;
};

/** User list row for selects (e.g. assign driver) */
export type UserSelectOption = {
  id: string;
  displayName?: string | null;
  username?: string | null;
};

export type AidCategoryOption = {
  id: string;
  name: string;
  items?: Array<{ id: string; name: string }>;
};

export type StockItemNested = {
  id: string;
  quantityReserved?: number;
  aidCategoryItemId?: string;
  availableQuantity?: number;
  deliveredQuantity?: number;
  quantityOnHand?: number;
  lowStockThreshold?: number;
  threshold?: number;
  supplier?: string | null;
  stockStatus?: string;
  aidCategoryItem?: {
    id?: string;
    name?: string | null;
    aidCategoryId?: string | null;
    aidCategory?: { id?: string; name?: string | null } | null;
  } | null;
};

export type DistributionLineItem = {
  id: string;
  quantityPlanned?: number;
  quantityDelivered?: number;
  stockItem?: {
    aidCategoryItem?: { name?: string | null } | null;
  } | null;
  aidCategory?: { name?: string | null } | null;
};

export type DistributionListRow = {
  id: string;
  status: string;
  beneficiary?: DistributionBeneficiaryBrief | null;
  createdBy?: { displayName?: string | null; username?: string | null } | null;
  driver?: { displayName?: string | null; username?: string | null } | null;
  completedBy?: { displayName?: string | null; username?: string | null } | null;
  items?: DistributionLineItem[];
  /** Present on `/distributions/by-area` responses */
  outForDeliveryAt?: string | null;
};

export type DistributionByAreaGroup = {
  areaKey: string;
  areaLabel: string;
  distributionCount: number;
  beneficiaryCount: number;
  distributions: DistributionListRow[];
};

export type DistributionByAreaResponse = {
  areas: DistributionByAreaGroup[];
  total: number;
};

export type DistributionBeneficiaryBrief = {
  fullName?: string | null;
  phone?: string | null;
  area?: string | null;
  street?: string | null;
  addressLine?: string | null;
  region?: { nameAr?: string | null; nameEn?: string | null } | null;
};

export type BeneficiaryPickRow = {
  id: string;
  fullName: string;
  phone: string;
  area?: string | null;
  street?: string | null;
  addressLine?: string | null;
  region?: { nameAr?: string | null; nameEn?: string | null } | null;
};

export type StockRowForSelect = {
  id: string;
  availableQuantity?: number;
  aidCategoryItem?: {
    id?: string;
    name?: string | null;
    aidCategoryId?: string | null;
    aidCategory?: { id?: string | null; name?: string | null } | null;
  } | null;
};

/** GET /beneficiaries/:id/recent-aid */
export type RecentAidDeliveredItem = {
  aidCategoryItemId: string | null;
  itemName: string;
  quantityDelivered: number;
};

export type RecentAidCategory = {
  aidCategoryId: string;
  aidCategoryName: string;
  lastDeliveredAt: string;
  deliveredItems: RecentAidDeliveredItem[];
};

export type RecentAidResponse = {
  days: number;
  since: string;
  categories: RecentAidCategory[];
};

/** GET /beneficiaries/:id/needs */
export type BeneficiaryNeedRow = {
  aidCategoryId: string;
  aidCategoryName: string;
  itemId: string | null;
  itemName: string | null;
  quantity: number;
  notes: string | null;
};

export type BeneficiaryNeedsResponse = {
  needs: BeneficiaryNeedRow[];
};

export type ItemNeedEntry = {
  id: string;
  needed?: boolean;
  quantity?: number;
  notes?: string | null;
  aidCategoryItemId?: string;
  aidCategoryItem?: {
    name?: string | null;
    aidCategory?: { name?: string | null } | null;
  } | null;
};

export type CategoryLinkRow = {
  id: string;
  quantity?: number;
  notes?: string | null;
  categoryId?: string;
  category?: { id?: string; name?: string | null } | null;
};

export type ItemNeedsByCategoryGroup = {
  category: { id: string; name: string };
  needs: ItemNeedEntry[];
};

export type BeneficiaryDistributionDetail = {
  id: string;
  status: string;
  createdAt: string;
  deliveredAt?: string | null;
  createdBy?: { displayName?: string | null } | null;
  items?: DistributionLineItem[];
};

export type TimelineEventEntry = {
  id: string;
  titleAr: string;
  createdAt: string;
  detail?: string | null;
};

/** GET /beneficiaries/:id — fields used by BeneficiaryDetailPage */
export type BeneficiaryDetailApi = {
  id: string;
  fullName?: string | null;
  phone?: string | null;
  area?: string | null;
  street?: string | null;
  addressLine?: string | null;
  status?: string;
  familyCount?: number;
  cookingStove?: boolean;
  itemNeeds?: ItemNeedEntry[];
  categories?: CategoryLinkRow[];
  itemNeedsByCategory?: ItemNeedsByCategoryGroup[];
  distributions?: BeneficiaryDistributionDetail[];
  timelineEvents?: TimelineEventEntry[];
};
