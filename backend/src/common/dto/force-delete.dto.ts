import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Typed confirmation for destructive admin overrides. */
export class ForceDeleteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  confirmationText!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
