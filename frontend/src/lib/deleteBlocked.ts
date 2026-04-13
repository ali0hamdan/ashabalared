export type DeleteBlockedPayload = {
  statusCode?: number;
  code: 'DELETE_BLOCKED';
  message: string;
  blockingRelations: string[];
  meta?: Record<string, unknown>;
};

function isDeleteBlockedPayload(d: unknown): d is DeleteBlockedPayload {
  const x = d as DeleteBlockedPayload | undefined;
  return Boolean(x && x.code === 'DELETE_BLOCKED' && Array.isArray(x.blockingRelations));
}

/** Parse Nest `DELETE_BLOCKED` body from an Axios error response. */
export function parseDeleteBlocked(e: unknown): DeleteBlockedPayload | null {
  const d = (e as { response?: { data?: unknown } })?.response?.data;
  return isDeleteBlockedPayload(d) ? d : null;
}

/** Parse `DELETE_BLOCKED` from a successful Axios response body (e.g. when using validateStatus for 409). */
export function parseDeleteBlockedBody(data: unknown): DeleteBlockedPayload | null {
  return isDeleteBlockedPayload(data) ? data : null;
}

export function parseForceDeleteForbidden(e: unknown): { code: string; message: string } | null {
  const d = (e as { response?: { data?: { code?: string; message?: string } } })?.response?.data;
  if (d?.code === 'FORCE_DELETE_FORBIDDEN' && typeof d.message === 'string') return d as { code: string; message: string };
  return null;
}
