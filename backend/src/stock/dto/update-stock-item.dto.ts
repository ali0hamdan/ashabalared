import { IsDateString, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateStockItemDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  quantityOnHand?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  quantityReserved?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  lowStockThreshold?: number;

  @IsOptional()
  @IsString()
  supplier?: string | null;

  @IsOptional()
  @IsDateString()
  expiryDate?: string | null;
}
