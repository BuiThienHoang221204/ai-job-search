import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { isUniqueViolation } from '../../prisma/prisma-errors.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { LoginDto, RegisterDto } from './auth.dto.js';

const BCRYPT_ROUNDS = 12;

export type AuthResult = {
  accessToken: string;
  user: { id: string; email: string; name: string };
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
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

    return this.sign(user);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user || !(await compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }
    return this.sign(user);
  }

  private sign(user: { id: string; email: string; name: string }): AuthResult {
    return {
      accessToken: this.jwt.sign({ sub: user.id, email: user.email }),
      user: { id: user.id, email: user.email, name: user.name },
    };
  }
}
