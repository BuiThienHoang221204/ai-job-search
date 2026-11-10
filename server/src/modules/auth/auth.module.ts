import { Module } from '@nestjs/common';
import { ReferralsModule } from '../referrals/referrals.module';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './services/auth.service';
import { EmailCodeService } from './services/email-code.service';
import { GoogleAuthService } from './services/google-auth.service';
import { JwtStrategy } from './jwt.strategy';
import { MailService } from './services/mail.service';

@Module({
  imports: [
    PassportModule,
    ReferralsModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('auth.jwtSecret')!,
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    GoogleAuthService,
    EmailCodeService,
    MailService,
  ],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
