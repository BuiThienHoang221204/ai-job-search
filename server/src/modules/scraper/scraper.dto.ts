import { IsOptional, IsString } from 'class-validator';

export class StartScrapeDto {
  @IsOptional() @IsString() portal?: string;
}
