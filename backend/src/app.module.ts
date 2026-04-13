import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RegionsModule } from './regions/regions.module';
import { BeneficiariesModule } from './beneficiaries/beneficiaries.module';
import { CategoriesModule } from './categories/categories.module';
import { StockModule } from './stock/stock.module';
import { DistributionModule } from './distribution/distribution.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
    }),
    PrismaModule,
    AuditModule,
    AuthModule,
    UsersModule,
    RegionsModule,
    BeneficiariesModule,
    CategoriesModule,
    StockModule,
    DistributionModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
