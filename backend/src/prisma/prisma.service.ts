import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
    await this.assertDatabaseSchemaMatchesPrisma();
  }

  /**
   * Fail fast with a clear message when the DB was never upgraded past init
   * (Prisma otherwise throws P2022 on almost every route — easy to misread as “app bugs”).
   * Set SKIP_DB_SCHEMA_CHECK=1 to bypass (e.g. exotic test DBs).
   */
  private async assertDatabaseSchemaMatchesPrisma() {
    if (
      process.env.SKIP_DB_SCHEMA_CHECK === '1' ||
      process.env.SKIP_DB_SCHEMA_CHECK === 'true'
    ) {
      this.logger.warn(
        'SKIP_DB_SCHEMA_CHECK is set; skipping schema compatibility probe',
      );
      return;
    }
    const rows = await this.$queryRaw<{ ok: number }[]>(Prisma.sql`
      SELECT 1 AS ok
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name ILIKE 'beneficiary'
        AND column_name ILIKE 'familycount'
      LIMIT 1
    `);
    if (!rows?.length) {
      throw new Error(
        'PostgreSQL is missing expected columns (e.g. public."Beneficiary"."familyCount"). ' +
          'Apply pending migrations from the backend folder: npx prisma migrate deploy',
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
