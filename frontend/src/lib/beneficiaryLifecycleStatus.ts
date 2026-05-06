/** Matches Prisma `BeneficiaryStatus` for non-archived records (create/update body). */
export const BENEFICIARY_LIFECYCLE = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;

export type BeneficiaryLifecycle = (typeof BENEFICIARY_LIFECYCLE)[keyof typeof BENEFICIARY_LIFECYCLE];

export function normalizeBeneficiaryLifecycle(
  raw: string | null | undefined,
): BeneficiaryLifecycle {
  return raw === BENEFICIARY_LIFECYCLE.INACTIVE
    ? BENEFICIARY_LIFECYCLE.INACTIVE
    : BENEFICIARY_LIFECYCLE.ACTIVE;
}
