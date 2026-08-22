import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtStrategy } from './jwt.strategy.js';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      /**
       * KHÔNG đặt `signOptions.expiresIn` ở đây: access và refresh có hạn khác
       * nhau, nên hạn được truyền theo từng lần `sign()` trong `AuthService`.
       * Để lại một giá trị mặc định ở đây thì nó âm thầm áp cho lời gọi nào
       * quên truyền, và một refresh token 15 phút trông y hệt token đúng.
       */
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('auth.jwtSecret')!,
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
