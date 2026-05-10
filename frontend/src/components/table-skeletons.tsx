import { Skeleton } from '@/components/ui/skeleton';

/** Matches Beneficiaries table layout (8 columns). */
export function BeneficiariesTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <table className="w-full min-w-[1040px] table-fixed border-separate border-spacing-0 text-sm">
      <colgroup>
        <col className="w-[17%]" />
        <col className="w-[12%]" />
        <col className="w-[14%]" />
        <col className="w-[18%]" />
        <col className="w-[7%]" />
        <col className="w-[10%]" />
        <col className="w-[9%]" />
        <col className="w-[13%]" />
      </colgroup>
      <thead>
        <tr className="border-b border-border bg-muted/40">
          {Array.from({ length: 8 }).map((_, i) => (
            <th key={i} scope="col" className="border-e border-border px-3 py-2.5 text-start">
              <Skeleton className="h-4 w-20 max-w-full" />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }).map((_, ri) => (
          <tr key={ri} className="border-b border-border">
            <td className="border-e border-border px-3 py-2.5 align-middle">
              <Skeleton className="h-4 w-[85%]" />
            </td>
            <td className="border-e border-border px-3 py-2.5 align-middle">
              <Skeleton className="h-4 w-24" />
            </td>
            <td className="border-e border-border px-3 py-2.5 align-middle">
              <Skeleton className="h-4 w-28" />
            </td>
            <td className="border-e border-border px-3 py-2.5 align-top">
              <div className="flex flex-wrap gap-1">
                <Skeleton className="h-5 w-16 rounded-md" />
                <Skeleton className="h-5 w-14 rounded-md" />
              </div>
            </td>
            <td className="border-e border-border px-3 py-2.5 align-middle">
              <Skeleton className="h-4 w-8" />
            </td>
            <td className="border-e border-border px-3 py-2.5 align-middle">
              <Skeleton className="h-6 w-16 rounded-full" />
            </td>
            <td className="border-e border-border px-3 py-2.5 align-middle">
              <Skeleton className="h-4 w-6" />
            </td>
            <td className="px-3 py-2.5 align-middle">
              <Skeleton className="h-9 w-full max-w-[5rem] rounded-md" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Delivery-by-area grouped sections (collapsible skeleton). */
export function DeliveryByAreaSkeleton({ sections = 3 }: { sections?: number }) {
  return (
    <div className="space-y-4" aria-busy={true}>
      {Array.from({ length: sections }).map((_, si) => (
        <div key={si} className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-3">
            <Skeleton className="h-6 w-40 max-w-[70%]" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
          <div className="space-y-3 p-4">
            <Skeleton className="h-28 w-full rounded-lg" />
            <Skeleton className="h-28 w-full rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Desktop distributions table (9 columns). */
export function DistributionsTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <table className="w-full min-w-[1180px] text-sm">
      <thead className="bg-muted/40 text-start">
        <tr className="border-b border-border">
          {Array.from({ length: 9 }).map((_, i) => (
            <th key={i} className="p-3">
              <Skeleton className="h-4 w-24" />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }).map((_, ri) => (
          <tr key={ri} className="border-b border-border align-top">
            <td className="p-3">
              <Skeleton className="h-4 w-36" />
            </td>
            <td className="p-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-1 h-3 w-28" />
            </td>
            <td className="p-3">
              <Skeleton className="h-4 w-28" />
            </td>
            <td className="p-3">
              <Skeleton className="h-6 w-20 rounded-full" />
            </td>
            <td className="p-3">
              <Skeleton className="h-4 w-24" />
            </td>
            <td className="p-3">
              <Skeleton className="h-4 w-28" />
            </td>
            <td className="p-3">
              <Skeleton className="h-4 w-24" />
            </td>
            <td className="p-3">
              <Skeleton className="h-3 w-full max-w-[12rem]" />
              <Skeleton className="mt-1 h-3 w-full max-w-[10rem]" />
            </td>
            <td className="p-3 space-y-2">
              <Skeleton className="h-9 w-full rounded-md" />
              <Skeleton className="h-9 w-full rounded-md" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function DistributionsMobileSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="space-y-3 p-3">
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-lg border border-border bg-card p-4 text-sm">
          <div className="flex justify-between gap-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <Skeleton className="h-3 w-48" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ))}
    </div>
  );
}

/** Aid category “beneficiaries needing” table (7 columns). */
export function CategoryBeneficiariesTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <table className="w-full min-w-[640px] text-left text-sm">
      <thead className="border-b border-border bg-muted/40">
        <tr>
          {Array.from({ length: 7 }).map((_, i) => (
            <th key={i} className="px-3 py-2 font-medium">
              <Skeleton className="h-4 w-20" />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }).map((_, ri) => (
          <tr key={ri} className="border-b border-border last:border-0">
            <td className="px-3 py-2">
              <Skeleton className="h-4 w-32" />
            </td>
            <td className="px-3 py-2">
              <Skeleton className="h-4 w-28" />
            </td>
            <td className="px-3 py-2">
              <Skeleton className="h-4 w-24" />
            </td>
            <td className="px-3 py-2">
              <Skeleton className="h-4 w-36" />
            </td>
            <td className="px-3 py-2">
              <Skeleton className="h-4 w-8" />
            </td>
            <td className="px-3 py-2">
              <Skeleton className="h-12 w-full max-w-[14rem]" />
            </td>
            <td className="px-3 py-2">
              <Skeleton className="h-8 w-20 rounded-md" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function CategoryBeneficiariesMobileSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="space-y-2 rounded-lg border border-border bg-muted/30 px-3 py-3 text-sm">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
      ))}
    </div>
  );
}

/** Beneficiaries history: stacked cards. */
/** Stock list table */
export function StockTableSkeleton({ rows = 8 }: { rows?: number }) {
  const cols = 7;
  return (
    <table className="w-full min-w-[820px] text-sm">
      <thead className="data-table-head">
        <tr>
          {Array.from({ length: cols }).map((_, i) => (
            <th key={i} className="data-table-th border-e border-border/40 last:border-e-0">
              <Skeleton className="h-3 w-20" />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }).map((_, ri) => (
          <tr key={ri} className="data-table-row border-b border-border/60">
            {Array.from({ length: cols }).map((_, ci) => (
              <td key={ci} className="data-table-td border-e border-border/40 last:border-e-0">
                <Skeleton className="h-4 w-full max-w-[8rem]" />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Audit log table */
export function AuditTableSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <table className="w-full min-w-[980px] text-sm">
      <thead className="data-table-head">
        <tr>
          {Array.from({ length: 5 }).map((_, i) => (
            <th key={i} className="data-table-th border-e border-border/40 last:border-e-0">
              <Skeleton className="h-3 w-24" />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }).map((_, ri) => (
          <tr key={ri} className="data-table-row border-b border-border/60">
            <td className="data-table-td border-e border-border/40">
              <Skeleton className="h-4 w-36" />
            </td>
            <td className="data-table-td border-e border-border/40">
              <Skeleton className="h-4 w-28" />
            </td>
            <td className="data-table-td border-e border-border/40">
              <Skeleton className="h-4 w-20" />
            </td>
            <td className="data-table-td border-e border-border/40">
              <Skeleton className="h-4 w-32" />
            </td>
            <td className="data-table-td">
              <Skeleton className="h-4 w-28" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Users admin table */
export function UsersTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <table className="w-full min-w-[980px] text-sm">
      <thead className="data-table-head">
        <tr>
          {Array.from({ length: 6 }).map((_, i) => (
            <th key={i} className="data-table-th border-e border-border/40 last:border-e-0">
              <Skeleton className="h-3 w-24" />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }).map((_, ri) => (
          <tr key={ri} className="data-table-row border-b border-border/60">
            {Array.from({ length: 6 }).map((_, ci) => (
              <td key={ci} className="data-table-td border-e border-border/40 last:border-e-0">
                <Skeleton className="h-4 w-full max-w-[10rem]" />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function BeneficiariesHistorySkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <ul className="space-y-3">
      {Array.from({ length: cards }).map((_, i) => (
        <li key={i}>
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-56" />
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-4 w-44" />
              </div>
              <Skeleton className="h-9 w-36 shrink-0 rounded-md" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
