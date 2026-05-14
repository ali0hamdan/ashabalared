/**
 * Allowed beneficiary area (dropdown) — same strings as backend.
 * Keep in sync with `backend/src/beneficiaries/constants/beneficiary-areas.ts`.
 */
export const BENEFICIARY_AREA_VALUES = [
  'Beirut Gharbiye',
  'Beirut Idariye',
  'Mant2a Al Sharkiye',
  'Quennarit',
  'Shwayfet',
  'Dahye',
  'Bshemoun',
  'Aramoun',
  'Khalde',
  'Hermel',
  'Baalback',
] as const;

export type BeneficiaryAreaValue = (typeof BENEFICIARY_AREA_VALUES)[number];

export function isAllowedBeneficiaryArea(value: string): boolean {
  const t = value.trim();
  return (BENEFICIARY_AREA_VALUES as readonly string[]).includes(t);
}
