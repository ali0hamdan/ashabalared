import { ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class DistributionLineDto {
  @IsString()
  stockItemId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreateDistributionDto {
  @IsString()
  beneficiaryId!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DistributionLineDto)
  items!: DistributionLineDto[];
}
