/**
 * Identifies the "food rations" aid category for business rules (cannot cook → no food rations).
 * Keep alias list aligned with `frontend/src/lib/foodRationsCategory.ts`.
 */
function squeezeWs(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

/** Lowercase only ASCII letters; preserves Arabic etc. for exact alias matching. */
function asciiLower(s: string): string {
  return s.replace(/[A-Z]/g, (c) => c.toLowerCase());
}

const FOOD_RATIONS_ALIASES_EXACT = new Set<string>([
  squeezeWs('حصص غذائية'),
  squeezeWs('Food rations'),
  squeezeWs('Food ration'),
  squeezeWs('Food'),
]);

export function isFoodRationsCategoryName(name: string | null | undefined): boolean {
  if (name === null || name === undefined) return false;
  const t = squeezeWs(name);
  if (!t.length) return false;
  if (FOOD_RATIONS_ALIASES_EXACT.has(t)) return true;
  const lower = asciiLower(t);
  if (FOOD_RATIONS_ALIASES_EXACT.has(lower)) return true;
  return false;
}
