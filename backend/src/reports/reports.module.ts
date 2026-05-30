import { Module } from '@nestjs/common';
import { PurchaseNeedsController } from './purchase-needs.controller';
import { PurchaseNeedsService } from './purchase-needs.service';

@Module({
  controllers: [PurchaseNeedsController],
  providers: [PurchaseNeedsService],
})
export class ReportsModule {}
