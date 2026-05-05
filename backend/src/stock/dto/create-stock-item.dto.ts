import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateStockItemDto {
  @IsString()
  aidCategoryItemId!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  quantityOnHand?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  lowStockThreshold?: number;

  @IsOptional()
  @IsString()
  supplier?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string | null;
}
