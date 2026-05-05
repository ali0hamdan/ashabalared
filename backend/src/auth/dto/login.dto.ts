import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  /** Login identifier: username or email (case-insensitive for both on PostgreSQL). */
  @IsString()
  @MinLength(2)
  username!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}
