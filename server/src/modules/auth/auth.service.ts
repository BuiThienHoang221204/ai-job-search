import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { messageOf } from '@/common/error-message';
import { isUniqueViolation } from '@/prisma/prisma-errors';
import { PrismaService } from '@/prisma/prisma.service';
import { ReferralsService } from '@/modules/referrals/referrals.service';
import {
  STORAGE,
  uploadKey,
  userKey,
  type Storage,
} from '@/modules/storage/storage.interface';
import { GoogleAuthService } from './google-auth.service';
import type { LoginDto, RegisterDto } from './auth.dto';
import {
  isAccessPayload,
  isRefreshPayload,
  type JwtPayload,
  type TokenType,
} from './jwt-payload';

const BCRYPT_ROUNDS = 12;

let dummyHash: Promise<string> | undefined;
const timingPadHash = () =>
  (dummyHash ??= hash('careelot-timing-pad', BCRYPT_ROUNDS));

export type AuthResult = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; name: string };
};

export type ExtAuthResult = {
  token: string;
  user: { id: string; email: string; name: string };
};

type SignedUser = { id: string; email: string; name: string };

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly google: GoogleAuthService,
    private readonly referrals: ReferralsService,
    @Inject(STORAGE) private readonly storage: Storage,
  ) {}

  /** Xoá tài khoản cùng mọi dữ liệu: bảng con xoá dây chuyền theo khoá ngoại, nhật ký gọi AI xoá riêng vì khoá ngoại của nó để SetNull, rồi dọn file trên kho lưu trữ. */
  async deleteAccount(userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.aiCall.deleteMany({ where: { userId } }),
      this.prisma.user.deleteMany({ where: { id: userId } }),
    ]);
    try {
      await this.storage.deletePrefix(userKey(userId, ''));
      await this.storage.deletePrefix(uploadKey(userId, ''));
    } catch (error) {
      this.logger.error(
        `Đã xoá tài khoản ${userId} nhưng chưa xoá được file: ${messageOf(error)}`,
      );
    }
  }

  async register(dto: RegisterDto): Promise<AuthResult> {
    const user = await this.prisma.user
      .create({
        data: {
          email: dto.email,
          name: dto.name,
          passwordHash: await hash(dto.password, BCRYPT_ROUNDS),
          termsAcceptedAt: new Date(),
          referredById: await this.referrals.referrerOf(dto.ref),
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
    const user = await this.verifyCredentials(dto);
    return this.sign(user, user.tokenVersion);
  }

  async extLogin(dto: LoginDto): Promise<ExtAuthResult> {
    const user = await this.verifyCredentials(dto);
    return this.extResult(user, user.tokenVersion);
  }

  async issueExtToken(userId: string): Promise<ExtAuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, tokenVersion: true },
    });
    if (!user) throw new UnauthorizedException('Phiên đăng nhập đã kết thúc');
    return this.extResult(user, user.tokenVersion);
  }

  /** So mật khẩu kể cả khi email không tồn tại (một hash giả) để thời gian phản hồi không lộ email nào đã đăng ký. Dùng chung cho đăng nhập web và extension. */
  private async verifyCredentials(dto: LoginDto) {
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
    return user;
  }

  async loginWithGoogle(idToken: string, ref?: string): Promise<AuthResult> {
    const profile = await this.google.verify(idToken);
    const email = profile.email.trim().toLowerCase();

    let user = await this.prisma.user.findUnique({
      where: { googleId: profile.googleId },
    });

    if (!user) {
      const existing = await this.prisma.user.findUnique({
        where: { email },
        select: { googleId: true },
      });
      if (existing?.googleId) {
        throw new ConflictException(
          'Email này đã liên kết với một tài khoản Google khác',
        );
      }
      user = await this.prisma.user.upsert({
        where: { email },
        update: {
          googleId: profile.googleId,
          passwordHash: null,
          tokenVersion: { increment: 1 },
        },
        create: {
          email,
          name: profile.name,
          googleId: profile.googleId,
          termsAcceptedAt: new Date(),
          referredById: await this.referrals.referrerOf(ref),
          profile: { create: {} },
        },
      });
    }

    return this.sign(user, user.tokenVersion);
  }

  /** Đăng xuất: tăng `tokenVersion` để thu hồi mọi token đã phát (kể cả refresh còn hạn 7 ngày và access đang còn hạn), đóng lỗ "token sau đăng xuất vẫn dùng được". Access token không còn hợp lệ thì bỏ qua, controller vẫn xoá cookie. */
  async logout(accessToken: string | undefined): Promise<void> {
    if (!accessToken) return;
    let payload: unknown = null;
    try {
      payload = this.jwt.verify(accessToken);
    } catch {
      return;
    }
    if (!isAccessPayload(payload)) return;
    await this.prisma.user.updateMany({
      where: { id: payload.sub, tokenVersion: payload.ver },
      data: { tokenVersion: { increment: 1 } },
    });
  }

  async refresh(token: string | undefined): Promise<AuthResult> {
    if (!token) throw new UnauthorizedException('Thiếu refresh token');

    let payload: unknown = null;
    try {
      payload = this.jwt.verify(token);
    } catch {
      payload = null;
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

  private sign(user: SignedUser, tokenVersion: number): AuthResult {
    return {
      accessToken: this.token(user, tokenVersion, 'access'),
      refreshToken: this.token(user, tokenVersion, 'refresh'),
      user: { id: user.id, email: user.email, name: user.name },
    };
  }

  private extResult(user: SignedUser, ver: number): ExtAuthResult {
    return {
      token: this.token(user, ver, 'ext'),
      user: { id: user.id, email: user.email, name: user.name },
    };
  }

  private expiryKey(typ: TokenType): string {
    if (typ === 'access') return 'auth.jwtAccessExpiresIn';
    if (typ === 'refresh') return 'auth.jwtRefreshExpiresIn';
    return 'auth.jwtExtExpiresIn';
  }

  private token(user: SignedUser, ver: number, typ: TokenType): string {
    const payload: JwtPayload = { sub: user.id, email: user.email, typ, ver };
    return this.jwt.sign(payload, {
      expiresIn: this.config.get<string>(
        this.expiryKey(typ),
      ) as `${number}${'s' | 'm' | 'h' | 'd'}`,
    });
  }
}
