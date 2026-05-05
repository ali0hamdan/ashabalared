import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { StockUnit } from '@prisma/client';

export class CreateCategoryItemSeedDto {
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

export class CreateCategoryDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCategoryItemSeedDto)
  items?: CreateCategoryItemSeedDto[];
}
