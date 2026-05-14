/**
 * Allowed beneficiary `area` values (dropdown).
 * Keep in sync with `frontend/src/lib/beneficiaryAreas.ts`.
 */
export const BENEFICIARY_AREA_VALUES = [
  'Beirut Gharbiye',
  'Beirut Idariye',
  'Mant2a Al Sharkiye',
  'Shwayfet',
  'Dahye',
  'Bshemoun',
  'Aramoun',
  'Khalde',
  'Hermel',
  'Baalback',
  'Quennarit',
] as const;

export type BeneficiaryAreaValue = (typeof BENEFICIARY_AREA_VALUES)[number];

export function isAllowedBeneficiaryArea(value: string): boolean {
  const t = value.trim();
  return (BENEFICIARY_AREA_VALUES as readonly string[]).includes(t);
}
