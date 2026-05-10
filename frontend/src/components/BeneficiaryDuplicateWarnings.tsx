import { BeneficiaryStatusBadge } from '@/components/StatusBadge';
import type {
  BeneficiaryDuplicateCheckMatch,
  BeneficiaryDuplicateCheckResult,
} from '@/hooks/useBeneficiaryDuplicateCheck';
import { cn } from '@/lib/utils';
import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

function ReasonChips({
  reasons,
}: {
  reasons: BeneficiaryDuplicateCheckMatch['matchReasons'];
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-1">
        {reasons.map((r) => (
        <span
          key={r}
          className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
        >
          {t(`beneficiaryDuplicate.matchReasons.${r}`, { defaultValue: r })}
        </span>
      ))}
    </div>
  );
}

export function BeneficiaryDuplicateWarnings({
  result,
  isLoading,
  isFetching,
  phoneDuplicateAcknowledged,
  onPhoneDuplicateAcknowledgedChange,
}: {
  result: BeneficiaryDuplicateCheckResult | undefined;
  isLoading: boolean;
  isFetching: boolean;
  phoneDuplicateAcknowledged: boolean;
  onPhoneDuplicateAcknowledgedChange: (v: boolean) => void;
}) {
  const { t } = useTranslation();

  const matches = result?.matches ?? [];
  const hasExactPhone = Boolean(result?.hasExactPhoneDuplicate);
  const hasSoftDup = matches.some((m) =>
    m.matchReasons.some((r) => r !== 'PHONE_EXACT'),
  );

  if (isLoading && !result) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
        {t('beneficiaryDuplicate.checking')}
      </div>
    );
  }

  if (!matches.length) {
    return null;
  }

  const titleKey = hasExactPhone ? 'beneficiaryDuplicate.titleExactPhone' : 'beneficiaryDuplicate.titlePossible';

  return (
    <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/35 dark:text-amber-50">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-semibold">{t(titleKey)}</div>
          {hasExactPhone ? (
            <p className="mt-1 text-xs opacity-90">{t('beneficiaryDuplicate.hintExactPhone')}</p>
          ) : hasSoftDup ? (
            <p className="mt-1 text-xs opacity-90">{t('beneficiaryDuplicate.hintPossible')}</p>
          ) : null}
        </div>
        {isFetching ? (
          <span className="text-xs text-muted-foreground">{t('beneficiaryDuplicate.refreshing')}</span>
        ) : null}
      </div>

      {hasExactPhone ? (
        <label className="flex cursor-pointer items-start gap-2 rounded-md border border-amber-300/80 bg-card/80 p-2 dark:border-amber-800/80">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 accent-amber-700"
            checked={phoneDuplicateAcknowledged}
            onChange={(e) => onPhoneDuplicateAcknowledgedChange(e.target.checked)}
          />
          <span className="text-xs leading-snug">{t('beneficiaryDuplicate.acknowledgePhone')}</span>
        </label>
      ) : null}

      <div className="overflow-x-auto rounded-md border border-amber-200/80 bg-card/90 dark:border-amber-900/50">
        <table className="w-full min-w-[520px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-2 py-1.5 font-medium">{t('beneficiaryDuplicate.colName')}</th>
              <th className="px-2 py-1.5 font-medium">{t('beneficiaryDuplicate.colPhone')}</th>
              <th className="px-2 py-1.5 font-medium">{t('beneficiaryDuplicate.colArea')}</th>
              <th className="px-2 py-1.5 font-medium">{t('beneficiaryDuplicate.colStreet')}</th>
              <th className="px-2 py-1.5 font-medium">{t('beneficiaryDuplicate.colStatus')}</th>
              <th className="px-2 py-1.5 font-medium">{t('beneficiaryDuplicate.colMatch')}</th>
              <th className="px-2 py-1.5 font-medium">{t('beneficiaryDuplicate.colOpen')}</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((m) => (
              <tr key={m.id} className="border-b border-border/80 last:border-0">
                <td className="max-w-[140px] px-2 py-1.5 align-top font-medium break-words">{m.fullName}</td>
                <td className="whitespace-nowrap px-2 py-1.5 align-top tabular-nums">{m.phone}</td>
                <td className="max-w-[120px] px-2 py-1.5 align-top break-words">
                  {m.area?.trim() ? m.area : t('common.dash')}
                </td>
                <td className="max-w-[180px] px-2 py-1.5 align-top break-words whitespace-pre-wrap">
                  {m.street?.trim() ? m.street : t('common.dash')}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 align-top">
                  <BeneficiaryStatusBadge status={m.status} />
                </td>
                <td className="px-2 py-1.5 align-top">
                  <ReasonChips reasons={m.matchReasons} />
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 align-top">
                  <Link
                    to={`/app/beneficiaries/${m.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      'inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2 text-[11px] font-medium text-foreground transition hover:bg-muted',
                    )}
                  >
                    <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                    {t('beneficiaryDuplicate.open')}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
