/**
 * Production-oriented seed: wipes application data and creates a single super-admin.
 * Run after deploy: `npx prisma db seed` (or `npm run prisma:seed`).
 *
 * Override via env (optional): SEED_SUPERADMIN_USERNAME, SEED_SUPERADMIN_DISPLAY_NAME,
 * SEED_SUPERADMIN_PASSWORD, SEED_SUPERADMIN_EMAIL
 */
import { Prisma, PrismaClient, RoleCode } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function wipeApplicationData(tx: Prisma.TransactionClient) {
  await tx.distributionRecordItem.deleteMany();
  await tx.deliveryAssignment.deleteMany();
  await tx.distributionRecord.deleteMany();
  await tx.stockMovement.deleteMany();
  await tx.stockItem.deleteMany();
  // BeneficiaryCategory references AidCategory — remove before catalog rows.
  await tx.beneficiaryCategory.deleteMany();
  await tx.beneficiaryTimelineEvent.deleteMany();
  await tx.beneficiary.deleteMany();
  await tx.aidCategoryItem.deleteMany();
  await tx.aidCategory.deleteMany();
  await tx.auditLog.deleteMany();
  await tx.refreshToken.deleteMany();
  await tx.user.updateMany({ data: { createdById: null } });
  await tx.user.deleteMany();
  await tx.region.deleteMany();
}

async function main() {
  const username = (process.env.SEED_SUPERADMIN_USERNAME ?? 'alihmdn').trim().toLowerCase();
  const displayName = (process.env.SEED_SUPERADMIN_DISPLAY_NAME ?? 'ali hamda').trim();
  const password = process.env.SEED_SUPERADMIN_PASSWORD ?? 'Alihamdan772003';
  const emailRaw = process.env.SEED_SUPERADMIN_EMAIL?.trim();
  const email = emailRaw ? emailRaw.toLowerCase() : null;

  if (!username || !displayName || !password) {
    throw new Error(
      'SEED_SUPERADMIN_USERNAME, SEED_SUPERADMIN_DISPLAY_NAME, and SEED_SUPERADMIN_PASSWORD are required.',
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.$transaction(async (tx) => {
    await wipeApplicationData(tx);

    const superRole = await tx.role.upsert({
      where: { code: RoleCode.SUPER_ADMIN },
      update: {},
      create: { code: RoleCode.SUPER_ADMIN, nameAr: 'مدير عام', nameEn: 'Super Admin' },
    });

    await tx.role.upsert({
      where: { code: RoleCode.ADMIN },
      update: {},
      create: { code: RoleCode.ADMIN, nameAr: 'مسؤول', nameEn: 'Admin' },
    });

    await tx.role.upsert({
      where: { code: RoleCode.DELIVERY },
      update: {},
      create: { code: RoleCode.DELIVERY, nameAr: 'توصيل', nameEn: 'Delivery' },
    });

    await tx.user.create({
      data: {
        username,
        displayName,
        email,
        passwordHash,
        roleId: superRole.id,
        mustChangePassword: false,
        isActive: true,
      },
    });
  });

  console.log(
    `Seed OK. Single super-admin: username \`${username}\`, display name "${displayName}". Roles exist; no demo data.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
