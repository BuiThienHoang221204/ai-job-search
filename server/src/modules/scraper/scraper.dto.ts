import { IsOptional, IsString, MaxLength } from 'class-validator';

export class StartScrapeDto {
  @IsOptional() @IsString() @MaxLength(60) portal?: string;
}
