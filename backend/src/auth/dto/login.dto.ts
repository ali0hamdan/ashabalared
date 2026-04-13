import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  /** Username or email (PostgreSQL case-insensitive match on email). */
  @IsString()
  @MinLength(2)
  username!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}
