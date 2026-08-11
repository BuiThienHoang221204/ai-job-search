import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { LoginDto, RegisterDto } from './dto/auth.dto.js';

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

  async register(dto: RegisterDto): Promise<AuthResult> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email đã được đăng ký');

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash: await hash(dto.password, BCRYPT_ROUNDS),
        // Tạo sẵn hồ sơ rỗng để các màn hình khác không phải xử lý trường
        // hợp null.
        profile: { create: {} },
      },
    });

    return this.sign(user);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    // Cùng một thông báo cho cả hai trường hợp, để không lộ email nào đã tồn
    // tại.
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
