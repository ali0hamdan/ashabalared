import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ForceDeleteUserDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  confirmationText!: string;

  /** When deleting your own account, must match your username (case-insensitive). */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  selfUsernameConfirm?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
