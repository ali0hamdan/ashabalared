import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(params: {
    action: string;
    actorUserId?: string | null;
    entityType: string;
    entityId?: string | null;
    details?: Prisma.InputJsonValue;
  }) {
    await this.prisma.auditLog.create({
      data: {
        action: params.action,
        actorUserId: params.actorUserId ?? undefined,
        entityType: params.entityType,
        entityId: params.entityId ?? undefined,
        details: params.details,
      },
    });
  }
}
