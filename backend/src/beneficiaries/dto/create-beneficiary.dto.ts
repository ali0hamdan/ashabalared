import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { BeneficiaryStatus } from '@prisma/client';
import { BENEFICIARY_AREA_VALUES } from '../constants/beneficiary-areas';
import { BeneficiaryCategoryNeedDto } from './beneficiary-category-need.dto';
import { BeneficiaryItemNeedDto } from './beneficiary-item-need.dto';

export class CreateBeneficiaryDto {
  @IsString()
  @MinLength(2)
  fullName!: string;

  /** Omit or leave blank to store a generic not-provided value server-side. */
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

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @IsIn(BENEFICIARY_AREA_VALUES as unknown as string[])
  area!: string;

  /**
   * Detailed address (building, floor, landmark, etc.).
   * Stored in `addressLine`; prefer this over legacy `addressLine` on create.
   */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  street?: string;

  @Transform(({ obj }) => (obj as { familyCount?: unknown; householdSize?: unknown }).familyCount ?? (obj as { householdSize?: unknown }).householdSize)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  familyCount!: number;

  /** @deprecated Use `familyCount`; accepted for API compatibility. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  householdSize?: number;

  /** Optional; omit or null to leave unset. */
  @IsOptional()
  @IsString()
  regionId?: string | null;

  @IsOptional()
  @IsString()
  district?: string;

  /** @deprecated Prefer `street`; both map to the same DB column. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
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

  /** Category-level selection; quantity may be 0 (checkbox only). Last entry wins per categoryId. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BeneficiaryCategoryNeedDto)
  categoryNeeds?: BeneficiaryCategoryNeedDto[];

  /** @deprecated Prefer `categoryNeeds`; each id becomes quantity 0 (category selected, no amount). */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categoryIds?: string[];

  /** Per-aid-category-item needs (`needed`, optional `quantity` default 0, optional `notes`). */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BeneficiaryItemNeedDto)
  itemNeeds?: BeneficiaryItemNeedDto[];

  /** @deprecated Use `itemNeeds`; same shape, accepted for API compatibility. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BeneficiaryItemNeedDto)
  needs?: BeneficiaryItemNeedDto[];
}
