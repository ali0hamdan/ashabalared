import { api } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

export type DuplicateMatchReason =
  | 'PHONE_EXACT'
  | 'NAME_AREA_SIMILAR'
  | 'NAME_STREET_SIMILAR';

export type BeneficiaryDuplicateCheckMatch = {
  id: string;
  fullName: string;
  phone: string;
  area: string | null;
  street: string | null;
  status: string;
  matchReasons: DuplicateMatchReason[];
};

export type BeneficiaryDuplicateCheckResult = {
  matches: BeneficiaryDuplicateCheckMatch[];
  hasExactPhoneDuplicate: boolean;
};

export type BeneficiaryDuplicateFields = {
  fullName: string;
  phone: string;
  area: string;
  street: string;
};

const DEBOUNCE_MS = 500;

export function useBeneficiaryDuplicateCheck(
  fields: BeneficiaryDuplicateFields,
  excludeId: string | undefined,
) {
  const [debounced, setDebounced] = useState(fields);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(fields), DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [fields]);

  const enabled =
    debounced.phone.trim().length === 8 ||
    (debounced.fullName.trim().length >= 2 && debounced.area.trim().length > 0) ||
    (debounced.fullName.trim().length >= 2 && debounced.street.trim().length >= 3);

  return useQuery({
    queryKey: [
      'beneficiaries',
      'duplicate-check',
      debounced.fullName,
      debounced.phone,
      debounced.area,
      debounced.street,
      excludeId ?? '',
    ],
    queryFn: async (): Promise<BeneficiaryDuplicateCheckResult> => {
      const { data } = await api.get<BeneficiaryDuplicateCheckResult>('/beneficiaries/duplicate-check', {
        params: {
          fullName: debounced.fullName.trim() || undefined,
          phone: debounced.phone.trim() || undefined,
          area: debounced.area.trim() || undefined,
          street: debounced.street.trim() || undefined,
          excludeId: excludeId?.trim() || undefined,
        },
      });
      return data;
    },
    enabled,
    staleTime: 20_000,
  });
}
