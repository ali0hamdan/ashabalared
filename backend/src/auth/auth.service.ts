import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { RoleCode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  private hashRefresh(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  async login(dto: LoginDto, ip?: string) {
    const identifier = dto.username.trim();
    if (!identifier) throw new UnauthorizedException('بيانات الدخول غير صحيحة');

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { username: { equals: identifier, mode: 'insensitive' } },
          { email: { equals: identifier, mode: 'insensitive' } },
        ],
      },
      include: { role: true },
    });
    if (!user || !user.isActive)
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    if (!user.passwordHash)
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('بيانات الدخول غير صحيحة');

    const accessToken = await this.jwt.signAsync(
      {
        sub: user.id,
        username: user.username,
        roleCode: user.role.code,
      },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES') ?? '15m',
      },
    );

    const rawRefresh = randomBytes(48).toString('base64url');
    const refreshDays = parseInt(
      this.config.get<string>('JWT_REFRESH_EXPIRES_DAYS') ?? '7',
      10,
    );
    const expiresAt = new Date(Date.now() + refreshDays * 86400_000);
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashRefresh(rawRefresh),
        expiresAt,
      },
    });

    await this.audit.log({
      action: 'LOGIN',
      actorUserId: user.id,
      entityType: 'USER',
      entityId: user.id,
      details: { ip },
    });

    return {
      accessToken,
      refreshToken: rawRefresh,
      mustChangePassword: user.mustChangePassword,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        roleCode: user.role.code as RoleCode,
        regionId: user.regionId,
      },
    };
  }

  async refresh(refreshToken: string | undefined) {
    if (!refreshToken) throw new UnauthorizedException();
    const hash = this.hashRefresh(refreshToken);
    const row = await this.prisma.refreshToken.findFirst({
      where: { tokenHash: hash, expiresAt: { gt: new Date() } },
      include: { user: { include: { role: true } } },
    });
    if (!row || !row.user.isActive) throw new UnauthorizedException();
    await this.prisma.refreshToken.delete({ where: { id: row.id } });

    const rawRefresh = randomBytes(48).toString('base64url');
    const refreshDays = parseInt(
      this.config.get<string>('JWT_REFRESH_EXPIRES_DAYS') ?? '7',
      10,
    );
    const expiresAt = new Date(Date.now() + refreshDays * 86400_000);
    await this.prisma.refreshToken.create({
      data: {
        userId: row.userId,
        tokenHash: this.hashRefresh(rawRefresh),
        expiresAt,
      },
    });

    const accessToken = await this.jwt.signAsync(
      {
        sub: row.user.id,
        username: row.user.username,
        roleCode: row.user.role.code,
      },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES') ?? '15m',
      },
    );

    return {
      accessToken,
      refreshToken: rawRefresh,
      user: {
        id: row.user.id,
        username: row.user.username,
        displayName: row.user.displayName,
        roleCode: row.user.role.code as RoleCode,
        regionId: row.user.regionId,
      },
    };
  }

  async logout(refreshToken: string | undefined, actorUserId?: string) {
    if (refreshToken) {
      const hash = this.hashRefresh(refreshToken);
      await this.prisma.refreshToken.deleteMany({ where: { tokenHash: hash } });
    }
    if (actorUserId) {
      await this.audit.log({
        action: 'LOGOUT',
        actorUserId,
        entityType: 'USER',
        entityId: actorUserId,
      });
    }
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true, region: true },
    });
    if (!user) throw new UnauthorizedException();
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      phone: user.phone,
      roleCode: user.role.code,
      region: user.region,
      isActive: user.isActive,
      mustChangePassword: user.mustChangePassword,
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const ok = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!ok) throw new ForbiddenException('كلمة المرور الحالية غير صحيحة');
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false },
    });
    await this.prisma.refreshToken.deleteMany({ where: { userId } });
    await this.audit.log({
      action: 'PASSWORD_CHANGED',
      actorUserId: userId,
      entityType: 'USER',
      entityId: userId,
    });
    return { ok: true };
  }
}
