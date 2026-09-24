import { IsOptional, IsString } from 'class-validator';

/** Cố ý KHÔNG dùng `@IsIn` cứng: portal quét lúc khởi động, decorator chạy lúc nạp class nên không thể biết trước. */
export class StartScrapeDto {
  @IsOptional() @IsString() portal?: string;
}
