import { IsEnum, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { StockUnit } from '@prisma/client';

export class CreateCategoryItemDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  defaultQuantity?: number;

  @IsOptional()
  @IsEnum(StockUnit)
  unit?: StockUnit;
}
