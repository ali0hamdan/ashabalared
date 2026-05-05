import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RoleCode } from '@prisma/client';

export type AuthUser = {
  userId: string;
  username: string;
  roleCode: RoleCode;
};

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest();
    return req.user as AuthUser;
  },
);
