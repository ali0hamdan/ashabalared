import { BeneficiaryStatus } from '@prisma/client';

/** Query flag: operational beneficiary pickers (default: ACTIVE only). */
export function parseForSelection(raw?: string): boolean {
  const v = String(raw ?? '').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

/** Widen `forSelection` lists to ACTIVE + INACTIVE (admins). */
export function parseIncludeInactive(raw?: string): boolean {
  const v = String(raw ?? '').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

export function beneficiaryStatusSortRank(s: BeneficiaryStatus): number {
  if (s === BeneficiaryStatus.ACTIVE) return 0;
  if (s === BeneficiaryStatus.INACTIVE) return 1;
  return 2;
}
