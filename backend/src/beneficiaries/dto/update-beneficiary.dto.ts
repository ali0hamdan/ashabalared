import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { BeneficiaryStatus } from '@prisma/client';
import { BeneficiaryCategoryNeedDto } from './beneficiary-category-need.dto';
import { BeneficiaryItemNeedDto } from './beneficiary-item-need.dto';

export class UpdateBeneficiaryDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  fullName?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'string') return value;
    const t = value.trim();
    return t.length ? t : undefined;
  })
  @IsString()
  @MinLength(3)
  phone?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  area?: string;

  @Transform(
    ({ obj }) =>
      (obj as { familyCount?: unknown; householdSize?: unknown }).familyCount ??
      (obj as { householdSize?: unknown }).householdSize,
  )
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  familyCount?: number;

  /** @deprecated Use `familyCount`. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  householdSize?: number;

  @IsOptional()
  @IsString()
  regionId?: string | null;

  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  street?: string | null;

  /** @deprecated Prefer `street`; both map to the same DB column. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  addressLine?: string | null;

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

  /** @deprecated Prefer `categoryNeeds`; each id becomes quantity 0 when replacing categories. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categoryIds?: string[];

  /**
   * When set (including `[]`), replaces all item-level need rows for this beneficiary.
   * Omit to leave existing `BeneficiaryItemNeed` rows unchanged.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BeneficiaryItemNeedDto)
  itemNeeds?: BeneficiaryItemNeedDto[];

  /** @deprecated Use `itemNeeds`; same semantics when replacing rows. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BeneficiaryItemNeedDto)
  needs?: BeneficiaryItemNeedDto[];
}
