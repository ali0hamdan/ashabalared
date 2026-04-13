import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class RegionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.region.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  async create(actorId: string, body: { nameAr: string; nameEn?: string; sortOrder?: number }) {
    const r = await this.prisma.region.create({
      data: { nameAr: body.nameAr, nameEn: body.nameEn, sortOrder: body.sortOrder ?? 0 },
    });
    await this.audit.log({
      action: 'REGION_CREATED',
      actorUserId: actorId,
      entityType: 'REGION',
      entityId: r.id,
      details: body,
    });
    return r;
  }

  async update(actorId: string, id: string, body: { nameAr?: string; nameEn?: string; sortOrder?: number }) {
    const r = await this.prisma.region.update({ where: { id }, data: body });
    await this.audit.log({
      action: 'REGION_UPDATED',
      actorUserId: actorId,
      entityType: 'REGION',
      entityId: id,
      details: body,
    });
    return r;
  }

  async remove(actorId: string, id: string) {
    const inUse = await this.prisma.beneficiary.count({ where: { regionId: id } });
    if (inUse) throw new BadRequestException('المنطقة مستخدمة');
    await this.prisma.region.delete({ where: { id } });
    await this.audit.log({
      action: 'REGION_DELETED',
      actorUserId: actorId,
      entityType: 'REGION',
      entityId: id,
    });
    return { ok: true };
  }
}
