export const DEFAULT_PAGE = 1;

export const DEFAULT_LIMIT = 25;

export const MAX_LIMIT = 100;

export type PaginatedResult<T> = {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export function parsePaginationQuery(raw: { page?: string; limit?: string }): {
  page: number;
  limit: number;
  skip: number;
} {
  const page = Math.max(
    1,
    parseInt(raw.page ?? `${DEFAULT_PAGE}`, 10) || DEFAULT_PAGE,
  );
  let limit = parseInt(raw.limit ?? `${DEFAULT_LIMIT}`, 10) || DEFAULT_LIMIT;
  limit = Math.min(MAX_LIMIT, Math.max(1, limit));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

export function buildPaginatedResult<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResult<T> {
  return {
    data,
    page,
    limit,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}

export function parseBoolQuery(raw?: string): boolean {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}
