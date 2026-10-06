import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { isUniqueViolation } from '@/prisma/prisma-errors';
import { PrismaService } from '@/prisma/prisma.service';
import { GoogleAuthService } from './google-auth.service';
import type { LoginDto, RegisterDto } from './auth.dto';
import {
  isRefreshPayload,
  type JwtPayload,
  type TokenType,
} from './jwt-payload';

const BCRYPT_ROUNDS = 12;

// Email không tồn tại vẫn băm thử với hash giả cùng cost: bỏ qua bcrypt thì phản hồi nhanh hơn ~250ms, đủ để dò email nào đã đăng ký.
let dummyHash: Promise<string> | undefined;
const timingPadHash = () =>
  (dummyHash ??= hash('careelot-timing-pad', BCRYPT_ROUNDS));

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
    private readonly google: GoogleAuthService,
  ) {}

  /** Chặn email trùng bằng unique của DB, KHÔNG đọc trước: vừa đóng khe race, vừa để cả hai nhánh cùng trả SAU khi băm mật khẩu — trả sớm thì đo thời gian là đoán được email nào đã đăng ký. */
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
    const matches = await compare(
      dto.password,
      user?.passwordHash ?? (await timingPadHash()),
    );
    if (!user || !matches) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }
    return this.sign(user, user.tokenVersion);
  }

  /** Email Google xác nhận rồi (`email_verified`) thì tự liên kết với tài khoản mật khẩu đã có cùng email, không bắt đăng nhập lại bằng mật khẩu. */
  async loginWithGoogle(idToken: string): Promise<AuthResult> {
    const profile = await this.google.verify(idToken);

    let user = await this.prisma.user.findUnique({
      where: { googleId: profile.googleId },
    });

    if (!user) {
      user = await this.prisma.user.upsert({
        where: { email: profile.email },
        update: { googleId: profile.googleId },
        create: {
          email: profile.email,
          name: profile.name,
          googleId: profile.googleId,
          profile: { create: {} },
        },
      });
    }

    return this.sign(user, user.tokenVersion);
  }

  async refresh(token: string | undefined): Promise<AuthResult> {
    if (!token) throw new UnauthorizedException('Thiếu refresh token');

    let payload: unknown = null;
    try {
      payload = this.jwt.verify(token);
    } catch {
      // Chữ ký sai hoặc hết hạn: để `payload = null` rơi xuống cùng một câu báo bên dưới.
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

  /** Vô hiệu MỌI token đã phát (kể cả access còn hạn) - gọi ở mọi chỗ phiên phải chết: đăng xuất mọi thiết bị, đổi mật khẩu, khoá tài khoản. */
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
