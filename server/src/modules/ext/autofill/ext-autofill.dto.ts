import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AutofillAnswerDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  question!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  role?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  company?: string;
}
