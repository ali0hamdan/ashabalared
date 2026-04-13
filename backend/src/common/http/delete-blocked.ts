import { HttpException, HttpStatus } from '@nestjs/common';

export const DELETE_BLOCKED_CODE = 'DELETE_BLOCKED' as const;
export const FORCE_DELETE_FORBIDDEN_CODE = 'FORCE_DELETE_FORBIDDEN' as const;

export type DeleteBlockedBody = {
  statusCode: number;
  code: typeof DELETE_BLOCKED_CODE;
  message: string;
  blockingRelations: string[];
  /** Optional machine-readable context for the UI */
  meta?: Record<string, unknown>;
};

export function deleteBlocked(message: string, blockingRelations: string[], meta?: Record<string, unknown>): HttpException {
  const body: DeleteBlockedBody = {
    statusCode: HttpStatus.CONFLICT,
    code: DELETE_BLOCKED_CODE,
    message,
    blockingRelations: [...new Set(blockingRelations)].filter(Boolean),
    ...(meta ? { meta } : {}),
  };
  return new HttpException(body, HttpStatus.CONFLICT);
}

export type ForceDeleteForbiddenBody = {
  statusCode: number;
  code: typeof FORCE_DELETE_FORBIDDEN_CODE;
  message: string;
};

export function forceDeleteForbidden(message: string): HttpException {
  const body: ForceDeleteForbiddenBody = {
    statusCode: HttpStatus.FORBIDDEN,
    code: FORCE_DELETE_FORBIDDEN_CODE,
    message,
  };
  return new HttpException(body, HttpStatus.FORBIDDEN);
}
