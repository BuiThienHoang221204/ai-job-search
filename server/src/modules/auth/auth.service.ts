import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { isUniqueViolation } from '../../prisma/prisma-errors.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { LoginDto, RegisterDto } from './auth.dto.js';
import {
  isRefreshPayload,
  type JwtPayload,
  type TokenType,
} from './jwt-payload.js';

const BCRYPT_ROUNDS = 12;

export type AuthResult = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; name: string };
};

type SignedUser = { id: string; email: string; name: string };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Chống email trùng bằng ràng buộc unique của DB, không bằng một lần đọc
   * trước đó. Ngoài việc đóng khe race (hai request cùng email đồng thời đều
   * đọc thấy "chưa có" rồi cùng ghi), cách này còn bịt một kênh phụ về thời
   */
  async register(dto: RegisterDto): Promise<AuthResult> {
    const user = await this.prisma.user
      .create({
        data: {
          email: dto.email,
          name: dto.name,
          passwordHash: await hash(dto.password, BCRYPT_ROUNDS),
          profile: { create: {} },
        },
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new ConflictException('Email đã được đăng ký');
        }
        throw error;
      });

    return this.sign(user, user.tokenVersion);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user || !(await compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }
    return this.sign(user, user.tokenVersion);
  }

  async refresh(token: string | undefined): Promise<AuthResult> {
    if (!token) throw new UnauthorizedException('Thiếu refresh token');

    let payload: unknown;
    try {
      payload = this.jwt.verify(token);
    } catch {
      throw new UnauthorizedException('Refresh token không hợp lệ');
    }
    if (!isRefreshPayload(payload)) {
      throw new UnauthorizedException('Refresh token không hợp lệ');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        tokenVersion: true,
      },
    });
    if (!user || user.tokenVersion !== payload.ver) {
      throw new UnauthorizedException('Phiên đăng nhập đã kết thúc');
    }

    return this.sign(user, user.tokenVersion);
  }

  /**
   * Vô hiệu MỌI token đã phát cho người dùng, kể cả access token đang còn hạn:
   * `JwtStrategy` đọc `tokenVersion` ở mỗi request nên hiệu lực là tức thì.
   *
   * Gọi hàm này ở mọi chỗ phiên đăng nhập phải chết: đăng xuất mọi thiết bị,
   * đổi mật khẩu, khoá tài khoản.
   */
  async revokeAllSessions(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
  }

  private sign(user: SignedUser, tokenVersion: number): AuthResult {
    return {
      accessToken: this.token(user, tokenVersion, 'access'),
      refreshToken: this.token(user, tokenVersion, 'refresh'),
      user: { id: user.id, email: user.email, name: user.name },
    };
  }

  private token(user: SignedUser, ver: number, typ: TokenType): string {
    const payload: JwtPayload = { sub: user.id, email: user.email, typ, ver };
    return this.jwt.sign(payload, {
      expiresIn: this.config.get<string>(
        typ === 'access'
          ? 'auth.jwtAccessExpiresIn'
          : 'auth.jwtRefreshExpiresIn',
      ) as `${number}${'s' | 'm' | 'h' | 'd'}`,
    });
  }
}
