import { Transform } from 'class-transformer';
import { Allow, IsBoolean, IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { RoleCode } from '@prisma/client';

function emptyToUndefined({ value }: { value: unknown }) {
  if (value === '' || value === null) return undefined;
  return value;
}

export class CreateUserDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString()
  @MinLength(2)
  username!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  displayName!: string;

  @Transform(({ value }) => {
    if (value === '' || value === null || value === undefined) return undefined;
    if (typeof value === 'string') {
      const t = value.trim();
      return t === '' ? undefined : t;
    }
    return value;
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @Transform(({ value }) => {
    const v = emptyToUndefined({ value });
    return typeof v === 'string' ? v.trim() : v;
  })
  @IsOptional()
  @IsString()
  phone?: string;

  /**
   * Alternate key used by some clients (`role`). Prefer `roleCode`.
   * Whitelisted so forbidNonWhitelisted does not reject the body.
   */
  @Allow()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  role?: string;

  @Transform(({ value, obj }) => {
    const o = obj as { role?: string };
    const normalize = (v: unknown) => {
      if (typeof v !== 'string') return v;
      const u = v.trim().toUpperCase();
      return u === RoleCode.ADMIN || u === RoleCode.DELIVERY ? u : v.trim();
    };
    const fromCode = normalize(value);
    if (fromCode === RoleCode.ADMIN || fromCode === RoleCode.DELIVERY) return fromCode;
    const fromRole = normalize(o.role);
    if (fromRole === RoleCode.ADMIN || fromRole === RoleCode.DELIVERY) return fromRole;
    return fromCode;
  })
  @IsIn([RoleCode.ADMIN, RoleCode.DELIVERY])
  roleCode!: RoleCode;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  regionId?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsBoolean()
  mustChangePassword?: boolean;
}
