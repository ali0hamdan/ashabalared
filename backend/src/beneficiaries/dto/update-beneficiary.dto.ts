import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { BeneficiaryStatus } from '@prisma/client';
import { LEBANESE_LOCAL_PHONE_REGEX } from '../constants/lebanese-phone';
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
    const digits = value.replace(/\D/g, '').slice(0, 8);
    if (digits.length) return digits;
    return value.trim() === '' ? '' : undefined;
  })
  @ValidateIf((_, v) => typeof v === 'string' && v.length > 0)
  @IsString()
  @Matches(LEBANESE_LOCAL_PHONE_REGEX, {
    message: 'Phone must be exactly 8 digits (Lebanese local format)',
  })
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
  @IsIn([BeneficiaryStatus.ACTIVE, BeneficiaryStatus.INACTIVE])
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
