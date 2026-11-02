import { IsString, MaxLength, MinLength } from 'class-validator';

export class ExtCompanyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  company!: string;
}
