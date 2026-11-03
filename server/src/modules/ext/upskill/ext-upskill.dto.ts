import { ArrayMaxSize, IsArray, IsString, MaxLength } from 'class-validator';

export class UpskillPlanDto {
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  skills!: string[];
}
