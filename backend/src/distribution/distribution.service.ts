import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  DistributionStatus,
  Prisma,
  RoleCode,
  StockMovementType,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import { AuditService } from '../audit/audit.service';

import { CreateDistributionDto } from './dto/create-distribution.dto';

import { DeliverDistributionDto } from './dto/deliver-distribution.dto';

import {
  deleteBlocked,
  forceDeleteForbidden,
} from '../common/http/delete-blocked';

import type { AuthUser } from '../common/decorators/current-user.decorator';

const distInclude = {
  beneficiary: { include: { region: true } },

  items: {
    include: {
      aidCategory: true,

      aidCategoryItem: {
        select: {
          id: true,

          aidCategoryId: true,

          name: true,

          defaultQuantity: true,

          unit: true,

          sortOrder: true,
        },
      },

      stockItem: {
        select: {
          id: true,

          aidCategoryItemId: true,

          quantityOnHand: true,

          quantityReserved: true,

          lowStockThreshold: true,

          supplier: true,

          expiryDate: true,

          createdAt: true,

          updatedAt: true,

          aidCategoryItem: {
            select: {
              id: true,

              aidCategoryId: true,

              name: true,

              defaultQuantity: true,

              unit: true,

              sortOrder: true,

              aidCategory: {
                select: {
                  id: true,

                  name: true,

                  description: true,

                  isActive: true,

                  createdAt: true,

                  updatedAt: true,
                },
              },
            },
          },
        },
      },
    },
  },

  createdBy: { select: { id: true, displayName: true, username: true } },

  driver: {
    select: { id: true, displayName: true, username: true, phone: true },
  },

  completedBy: { select: { id: true, displayName: true, username: true } },
} satisfies Prisma.DistributionRecordInclude;

@Injectable()
export class DistributionService {
  constructor(
    private readonly prisma: PrismaService,

    private readonly audit: AuditService,
  ) {}

  private normalizeDistributionStatus(
    raw?: string,
  ): DistributionStatus | undefined {
    if (raw === undefined || raw === null || String(raw).trim() === '')
      return undefined;

    const v = String(raw).trim() as DistributionStatus;

    if (!Object.values(DistributionStatus).includes(v)) {
      throw new BadRequestException(`Invalid distribution status: ${raw}`);
    }

    return v;
  }

  async list(
    actor: { userId: string; roleCode: RoleCode },
    query: { status?: string; q?: string },
  ) {
    const where: Prisma.DistributionRecordWhereInput = {};

    if (actor.roleCode === RoleCode.DELIVERY) {
      where.driverId = actor.userId;
    }

    const status = this.normalizeDistributionStatus(query.status);

    if (status) where.status = status;

    const q = query.q?.trim();

    if (q) {
      where.OR = [
        { beneficiary: { fullName: { contains: q, mode: 'insensitive' } } },

        { beneficiary: { phone: { contains: q, mode: 'insensitive' } } },
      ];
    }

    return this.prisma.distributionRecord.findMany({
      where,

      orderBy: { createdAt: 'desc' },

      include: distInclude,
    });
  }

  async get(actor: { userId: string; roleCode: RoleCode }, id: string) {
    const d = await this.prisma.distributionRecord.findUnique({
      where: { id },
      include: distInclude,
    });

    if (!d) throw new NotFoundException();

    if (actor.roleCode === RoleCode.DELIVERY && d.driverId !== actor.userId) {
      throw new ForbiddenException();
    }

    return d;
  }

  async create(actorId: string, dto: CreateDistributionDto) {
    const beneficiary = await this.prisma.beneficiary.findFirst({
      where: { id: dto.beneficiaryId, deletedAt: null },
    });

    if (!beneficiary) throw new NotFoundException('المستفيد غير موجود');

    const linesPayload: Prisma.DistributionRecordItemCreateWithoutDistributionRecordInput[] =
      [];

    const seenStock = new Set<string>();

    for (const line of dto.items) {
      if (seenStock.has(line.stockItemId))
        throw new BadRequestException('صنف مخزون مكرر في الطلب');

      seenStock.add(line.stockItemId);

      if (line.quantity < 1)
        throw new BadRequestException('الكمية يجب أن تكون أكبر من صفر');

      const stock = await this.prisma.stockItem.findUnique({
        where: { id: line.stockItemId },

        select: {
          id: true,

          aidCategoryItemId: true,

          quantityOnHand: true,

          aidCategoryItem: {
            select: { id: true, name: true, aidCategoryId: true },
          },
        },
      });

      if (!stock?.aidCategoryItem)
        throw new BadRequestException('صنف مخزون غير صالح');

      if (line.quantity > stock.quantityOnHand) {
        throw new BadRequestException(
          `مخزون غير كافٍ لـ ${stock.aidCategoryItem.name}`,
        );
      }

      linesPayload.push({
        aidCategory: { connect: { id: stock.aidCategoryItem.aidCategoryId } },

        aidCategoryItem: { connect: { id: stock.aidCategoryItemId } },

        stockItem: { connect: { id: stock.id } },

        quantityPlanned: line.quantity,
      });
    }

    const created = await this.prisma.distributionRecord.create({
      data: {
        beneficiaryId: dto.beneficiaryId,

        createdById: actorId,

        notes: dto.notes,

        status: DistributionStatus.PENDING,

        items: { create: linesPayload },
      },

      include: distInclude,
    });

    await this.prisma.beneficiaryTimelineEvent.create({
      data: {
        beneficiaryId: dto.beneficiaryId,

        titleAr: 'تسجيل طلب مساعدة / توزيع',

        eventType: 'DISTRIBUTION_CREATED',

        relatedId: created.id,
      },
    });

    await this.audit.log({
      action: 'DISTRIBUTION_CREATED',

      actorUserId: actorId,

      entityType: 'DISTRIBUTION',

      entityId: created.id,
    });

    return created;
  }

  async assignDriver(actorId: string, id: string, driverId: string) {
    const dist = await this.prisma.distributionRecord.findUnique({
      where: { id },
    });

    if (!dist) throw new NotFoundException();

    if (
      dist.status === DistributionStatus.ASSIGNED &&
      dist.driverId === driverId
    ) {
      const unchanged = await this.prisma.distributionRecord.findUnique({
        where: { id },
        include: distInclude,
      });

      if (!unchanged) throw new NotFoundException();

      return unchanged;
    }

    if (dist.status === DistributionStatus.ASSIGNED) {
      throw new BadRequestException('تم تعيين سائق لهذا التوزيع مسبقاً');
    }

    if (dist.status !== DistributionStatus.PENDING) {
      throw new BadRequestException(
        'يمكن تعيين السائق للتوزيعات في حالة الانتظار فقط',
      );
    }

    const driverUser = await this.prisma.user.findUnique({
      where: { id: driverId },

      include: { role: true },
    });

    if (!driverUser) throw new NotFoundException('المستخدم غير موجود');

    if (!driverUser.isActive) throw new BadRequestException('السائق غير نشط');

    if (driverUser.role.code !== RoleCode.DELIVERY) {
      throw new ForbiddenException('يمكن تعيين مستخدمي التوصيل فقط كسائق');
    }

    try {
      const updated = await this.prisma.distributionRecord.update({
        where: { id },

        data: {
          driverId,

          status: DistributionStatus.ASSIGNED,

          assignedAt: new Date(),
        },

        include: distInclude,
      });

      await this.audit.log({
        action: 'DISTRIBUTION_DRIVER_ASSIGNED',

        actorUserId: actorId,

        entityType: 'DISTRIBUTION',

        entityId: id,

        details: { driverId },
      });

      return updated;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientUnknownRequestError &&
        err.message.includes('DistributionStatus') &&
        err.message.includes('ASSIGNED')
      ) {
        throw new BadRequestException(
          'قيمة حالة ASSIGNED غير موجودة في قاعدة البيانات. نفّذ ترحيل Prisma: npx prisma migrate deploy',
        );
      }

      throw err;
    }
  }

  async confirmDelivery(
    actorUserId: string,
    id: string,
    dto: DeliverDistributionDto,
  ) {
    const dist = await this.prisma.distributionRecord.findUnique({
      where: { id },

      include: { items: true },
    });

    if (!dist) throw new NotFoundException();

    if (dist.driverId !== actorUserId) {
      throw new ForbiddenException('فقط السائق المعيّن يمكنه تأكيد التسليم');
    }

    if (dist.status !== DistributionStatus.ASSIGNED) {
      throw new BadRequestException(
        'يمكن تأكيد التسليم للتوزيعات المعيّنة للسائق فقط',
      );
    }

    if (!dist.items.length)
      throw new BadRequestException('التوزيع لا يحتوي بنوداً');

    const deliveredByLine = new Map<string, number>();

    if (dto.lines?.length) {
      for (const l of dto.lines) deliveredByLine.set(l.id, l.quantityDelivered);
    }

    await this.prisma.$transaction(async (tx) => {
      for (const line of dist.items) {
        const qtyDelivered =
          deliveredByLine.get(line.id) ?? line.quantityPlanned;

        if (qtyDelivered < 0 || qtyDelivered > line.quantityPlanned) {
          throw new BadRequestException('كمية تسليم غير صالحة');
        }

        const stock = await tx.stockItem.findUnique({
          where: { id: line.stockItemId },
        });

        if (!stock) throw new BadRequestException('مخزون مفقود');

        if (qtyDelivered > stock.quantityOnHand) {
          throw new BadRequestException(
            'الكمية المسلّمة تتجاوز المتاح في المخزون',
          );
        }

        if (qtyDelivered > 0) {
          await tx.stockItem.update({
            where: { id: stock.id },

            data: { quantityOnHand: { decrement: qtyDelivered } },
          });

          await tx.stockMovement.create({
            data: {
              stockItemId: stock.id,

              quantityDelta: -qtyDelivered,

              movementType: StockMovementType.DELIVERY_OUT,

              referenceType: 'DISTRIBUTION',

              referenceId: dist.id,

              createdById: actorUserId,

              note: dto.deliveryProofNote,
            },
          });
        }

        await tx.distributionRecordItem.update({
          where: { id: line.id },

          data: { quantityDelivered: qtyDelivered },
        });
      }

      await tx.distributionRecord.update({
        where: { id },

        data: {
          status: DistributionStatus.DELIVERED,

          deliveredAt: new Date(),

          completedById: actorUserId,

          deliveryProofNote: dto.deliveryProofNote,
        },
      });

      await tx.beneficiaryTimelineEvent.create({
        data: {
          beneficiaryId: dist.beneficiaryId,

          titleAr: 'تم تسليم مساعدة',

          eventType: 'DISTRIBUTION_DELIVERED',

          relatedId: dist.id,

          detail: dto.deliveryProofNote,
        },
      });
    });

    await this.audit.log({
      action: 'DISTRIBUTION_DELIVERED',

      actorUserId: actorUserId,

      entityType: 'DISTRIBUTION',

      entityId: id,
    });

    return this.get({ userId: actorUserId, roleCode: RoleCode.DELIVERY }, id);
  }

  async cancel(actorId: string, id: string) {
    const dist = await this.prisma.distributionRecord.findUnique({
      where: { id },

      include: { items: true },
    });

    if (!dist) throw new NotFoundException();

    if (
      dist.status !== DistributionStatus.PENDING &&
      dist.status !== DistributionStatus.ASSIGNED
    ) {
      throw new BadRequestException(
        'يمكن إلغاء التوزيعات في حالة الانتظار أو المعيّنة فقط',
      );
    }

    await this.prisma.distributionRecord.update({
      where: { id },

      data: {
        status: DistributionStatus.CANCELLED,

        cancelledAt: new Date(),

        driverId: null,

        assignedAt: null,
      },
    });

    await this.audit.log({
      action: 'DISTRIBUTION_CANCELLED',

      actorUserId: actorId,

      entityType: 'DISTRIBUTION',

      entityId: id,
    });

    return { ok: true };
  }

  async remove(actorId: string, id: string) {
    const dist = await this.prisma.distributionRecord.findUnique({
      where: { id },
    });

    if (!dist) throw new NotFoundException();

    if (dist.status === DistributionStatus.DELIVERED) {
      throw deleteBlocked(
        'Delivered distributions cannot be deleted; historical integrity is preserved.',
        ['invalidStatus'],
        {
          status: dist.status,
        },
      );
    }

    await this.prisma.distributionRecord.delete({ where: { id } });

    await this.audit.log({
      action: 'DISTRIBUTION_DELETED',

      actorUserId: actorId,

      entityType: 'DISTRIBUTION',

      entityId: id,
    });

    return { ok: true };
  }

  async forceRemove(
    actor: AuthUser,
    id: string,
    confirmationText: string,
    reason?: string,
  ) {
    if (
      actor.roleCode !== RoleCode.SUPER_ADMIN &&
      actor.roleCode !== RoleCode.ADMIN
    )
      throw new ForbiddenException();

    if (String(confirmationText ?? '').trim() !== 'DELETE') {
      throw new BadRequestException(
        'Confirmation must be the word DELETE (exact match).',
      );
    }

    const dist = await this.prisma.distributionRecord.findUnique({
      where: { id },
    });

    if (!dist) throw new NotFoundException();

    if (dist.status === DistributionStatus.DELIVERED) {
      throw forceDeleteForbidden(
        'Delivered distributions cannot be force-deleted; historical integrity is preserved.',
      );
    }

    await this.prisma.distributionRecord.delete({ where: { id } });

    await this.audit.log({
      action: 'DISTRIBUTION_FORCE_DELETED',

      actorUserId: actor.userId,

      entityType: 'DISTRIBUTION',

      entityId: id,

      details: {
        actorRole: actor.roleCode,

        priorStatus: dist.status,

        reason: reason ?? null,

        confirmationText: 'DELETE',
      },
    });

    return { ok: true };
  }
}
