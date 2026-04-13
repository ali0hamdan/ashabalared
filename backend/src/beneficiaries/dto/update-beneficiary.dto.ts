import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min, MinLength, ValidateNested } from 'class-validator';
import { BeneficiaryStatus } from '@prisma/client';
import { BeneficiaryCategoryNeedDto } from './beneficiary-category-need.dto';

export class UpdateBeneficiaryDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  phone?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  area?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  familyCount?: number;

  @IsOptional()
  @IsString()
  regionId?: string | null;

  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @IsString()
  addressLine?: string;

  @IsOptional()
  @IsBoolean()
  cookingStove?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  medicalNotes?: string;

  @IsOptional()
  @IsString()
  deliveryNotes?: string;

  @IsOptional()
  @IsEnum(BeneficiaryStatus)
  status?: BeneficiaryStatus;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BeneficiaryCategoryNeedDto)
  categoryNeeds?: BeneficiaryCategoryNeedDto[];

  /** @deprecated Prefer categoryNeeds; when categoryNeeds absent but this is set, quantity 1 each. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categoryIds?: string[];
}
