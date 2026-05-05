import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class BeneficiaryItemNeedDto {
  @IsString()
  aidCategoryItemId!: string;

  @IsBoolean()
  needed!: boolean;

  /** Defaults to 0 when omitted. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity?: number;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}
