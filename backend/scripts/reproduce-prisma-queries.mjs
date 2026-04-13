/**
 * One-off: run the same Prisma shapes as list endpoints; prints errors to stdout.
 * Usage (from backend/): node scripts/reproduce-prisma-queries.mjs
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PrismaClient, BeneficiaryStatus, DistributionStatus, RoleCode } from '@prisma/client';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env'), override: true });

const prisma = new PrismaClient();

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

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
  driver: { select: { id: true, displayName: true, username: true, phone: true } },
  completedBy: { select: { id: true, displayName: true, username: true } },
};

const stockItemResponseSelect = {
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
};

async function main() {
  const today = startOfToday();
  const steps = [
    ['$connect', () => prisma.$connect()],
    [
      'beneficiary.count',
      () => prisma.beneficiary.count({ where: { deletedAt: null } }),
    ],
    [
      'beneficiary.findMany (list shape)',
      () =>
        prisma.beneficiary.findMany({
          where: { deletedAt: null },
          take: 1,
          include: {
            region: true,
            categories: { include: { category: true } },
            _count: { select: { distributions: true } },
          },
        }),
    ],
    [
      'aidCategory.findMany',
      () =>
        prisma.aidCategory.findMany({
          where: { isActive: true },
          take: 1,
          include: { items: { orderBy: { sortOrder: 'asc' } } },
        }),
    ],
    [
      'stockItem.findMany',
      () =>
        prisma.stockItem.findMany({
          take: 1,
          select: stockItemResponseSelect,
        }),
    ],
    [
      'distributionRecord.findMany',
      () =>
        prisma.distributionRecord.findMany({
          take: 1,
          include: distInclude,
        }),
    ],
    [
      'dashboard counts batch',
      async () => {
        await Promise.all([
          prisma.beneficiary.count({ where: { deletedAt: null } }),
          prisma.beneficiary.count({
            where: { deletedAt: null, status: BeneficiaryStatus.ACTIVE },
          }),
          prisma.user.count({ where: { isActive: true, role: { code: RoleCode.ADMIN } } }),
          prisma.user.count({ where: { isActive: true, role: { code: RoleCode.DELIVERY } } }),
          prisma.distributionRecord.count(),
          prisma.distributionRecord.count({ where: { status: DistributionStatus.PENDING } }),
          prisma.distributionRecord.count({
            where: { status: DistributionStatus.DELIVERED, deliveredAt: { gte: today } },
          }),
        ]);
      },
    ],
    [
      'stockItem low-stock select (dashboard)',
      () =>
        prisma.stockItem.findMany({
          take: 1,
          select: {
            id: true,
            quantityOnHand: true,
            quantityReserved: true,
            lowStockThreshold: true,
            aidCategoryItem: {
              select: {
                name: true,
                aidCategory: { select: { name: true } },
              },
            },
          },
        }),
    ],
  ];

  for (const [name, fn] of steps) {
    try {
      await fn();
      console.log(`OK  ${name}`);
    } catch (e) {
      console.log(`ERR ${name}`);
      console.log(e);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
