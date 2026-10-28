import { IsInt, IsString, Max, MaxLength, Min } from 'class-validator';

export class CvCheckDto {
  @IsString()
  @MaxLength(40_000, { message: 'Chữ của CV dài quá 40.000 ký tự' })
  text!: string;

  @IsInt() @Min(1) @Max(500) pages!: number;

  @IsInt() @Min(1) @Max(10) pagesRead!: number;
}
