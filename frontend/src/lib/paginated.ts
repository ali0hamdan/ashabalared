/** Matches backend `PaginatedResult<T>` from Nest pagination helpers. */
export type PaginatedResponse<T> = {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};
