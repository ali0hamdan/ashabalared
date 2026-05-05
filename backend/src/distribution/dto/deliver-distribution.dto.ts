import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class DeliverLineDto {
  @IsString()
  id!: string;

  @IsInt()
  @Min(0)
  quantityDelivered!: number;
}

export class DeliverDistributionDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeliverLineDto)
  lines?: DeliverLineDto[];

  @IsOptional()
  @IsString()
  deliveryProofNote?: string;
}
