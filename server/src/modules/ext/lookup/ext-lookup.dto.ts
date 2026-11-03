import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ExtLookupDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  company?: string;
}
