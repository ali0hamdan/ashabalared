import { Module } from '@nestjs/common';
import { BeneficiariesService } from './beneficiaries.service';
import { BeneficiariesController } from './beneficiaries.controller';
import { BeneficiariesHistoryController } from './beneficiaries-history.controller';

@Module({
  controllers: [BeneficiariesController, BeneficiariesHistoryController],
  providers: [BeneficiariesService],
  exports: [BeneficiariesService],
})
export class BeneficiariesModule {}
