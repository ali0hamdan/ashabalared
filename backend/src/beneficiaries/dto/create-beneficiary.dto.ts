import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min, MinLength, ValidateNested } from 'class-validator';
import { BeneficiaryStatus } from '@prisma/client';
import { BeneficiaryCategoryNeedDto } from './beneficiary-category-need.dto';

export class CreateBeneficiaryDto {
  @IsString()
  @MinLength(2)
  fullName!: string;

  @IsString()
  @MinLength(3)
  phone!: string;

  @IsString()
  @MinLength(1)
  area!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  familyCount!: number;

  /** Optional; omit or null to leave unset. */
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

  /** Quantities ≥ 1 only; omit empty/zero categories. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BeneficiaryCategoryNeedDto)
  categoryNeeds?: BeneficiaryCategoryNeedDto[];

  /** @deprecated Prefer categoryNeeds with quantities; treated as quantity 1 each when categoryNeeds absent. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categoryIds?: string[];
}
