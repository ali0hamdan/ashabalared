import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class BeneficiaryCategoryNeedDto {
  @IsString()
  categoryId!: string;

  /** When false, the entry is ignored (use omit from list instead when replacing all needs). */
  @IsOptional()
  @IsBoolean()
  needed?: boolean;

  /** 0 = category selected with no amount yet; optional and defaults to 0 when omitted. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}
