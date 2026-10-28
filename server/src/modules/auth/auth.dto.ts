import { Transform } from 'class-transformer';
import {
  Equals,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

const normalizedEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

const TERMS_MESSAGE =
  'Hãy đồng ý với Điều khoản sử dụng và Chính sách bảo mật để tiếp tục.';

export class RegisterDto {
  @Transform(normalizedEmail)
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Mật khẩu tối thiểu 8 ký tự' })
  @MaxLength(72, { message: 'Mật khẩu tối đa 72 ký tự' })
  password!: string;

  @IsString()
  @MinLength(1, { message: 'Tên không được để trống' })
  @MaxLength(200, { message: 'Tên tối đa 200 ký tự' })
  name!: string;

  @Equals(true, { message: TERMS_MESSAGE }) acceptTerms!: boolean;

  @IsOptional() @IsString() @MaxLength(16) ref?: string;
}

export class LoginDto {
  @Transform(normalizedEmail)
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email!: string;

  @IsString()
  password!: string;
}

export class GoogleLoginDto {
  @IsString()
  @MinLength(1, { message: 'Thiếu ID token' })
  idToken!: string;

  @Equals(true, { message: TERMS_MESSAGE }) acceptTerms!: boolean;

  @IsOptional() @IsString() @MaxLength(16) ref?: string;
}
