import { applyDecorators, UseGuards } from '@nestjs/common';
import { Public } from '@/common/decorators/public.decorator';
import { ExtAuthGuard } from './ext-auth.guard';

/** Route chỉ nhận ext token (Bearer): bỏ `JwtAuthGuard` toàn cục (`@Public`) và chạy `ExtAuthGuard`. */
export const ExtAuth = () => applyDecorators(Public(), UseGuards(ExtAuthGuard));
