/** Reasons returned by GET /beneficiaries/duplicate-check for each candidate row. */
export type DuplicateMatchReason =
  | 'PHONE_EXACT'
  | 'NAME_AREA_SIMILAR'
  | 'NAME_STREET_SIMILAR';

export function normalizeComparableText(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFKC')
    .toLocaleLowerCase();
}

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost,
      );
    }
  }
  return dp[m]![n]!;
}

/** Loose fuzzy match for Arabic/Latin names (typo-tolerant). */
export function namesSimilar(a: string, b: string): boolean {
  const na = normalizeComparableText(a);
  const nb = normalizeComparableText(b);
  if (!na.length || !nb.length) return false;
  if (na === nb) return true;
  const d = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return d <= Math.max(2, Math.floor(maxLen * 0.35));
}

export function normalizeStreetComparable(s: string): string {
  return normalizeComparableText(s);
}

/** Compare free-text street / address lines (subset + edit distance). */
export function streetsSimilar(a: string, b: string): boolean {
  const na = normalizeStreetComparable(a);
  const nb = normalizeStreetComparable(b);
  if (na.length < 3 || nb.length < 3) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const d = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return d <= Math.max(2, Math.floor(maxLen * 0.42));
}

/** Longest token or prefix suitable for Prisma `contains` pre-filter. */
export function streetSearchToken(street: string): string | null {
  const norm = normalizeStreetComparable(street);
  if (norm.length < 3) return null;
  const parts = norm.split(/\s+/).filter((p) => p.length >= 3);
  if (parts.length === 0) {
    return norm.slice(0, Math.min(24, norm.length));
  }
  parts.sort((x, y) => y.length - x.length);
  return parts[0]!.slice(0, Math.min(32, parts[0]!.length));
}

export function areasEqualCaseInsensitive(a: string, b: string): boolean {
  return normalizeComparableText(a) === normalizeComparableText(b);
}

export function sortDuplicateMatches<T extends { matchReasons: DuplicateMatchReason[] }>(
  rows: T[],
  max: number,
): T[] {
  const score = (r: T): number => {
    let s = 0;
    if (r.matchReasons.includes('PHONE_EXACT')) s += 8;
    if (r.matchReasons.includes('NAME_AREA_SIMILAR')) s += 4;
    if (r.matchReasons.includes('NAME_STREET_SIMILAR')) s += 2;
    return s;
  };
  return [...rows].sort((a, b) => score(b) - score(a)).slice(0, max);
}
