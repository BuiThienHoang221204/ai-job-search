import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ExtSaveJobDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  url!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  company?: string | null;

  @IsString()
  @MaxLength(20000)
  descriptionText!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  logoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  locationText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  salaryText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  postedText?: string;
}
