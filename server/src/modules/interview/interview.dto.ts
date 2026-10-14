import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { ANSWER_KINDS, type AnswerKindParam } from './utils/interview-answers';

export class PrepDto {
  @IsString() jobId!: string;
  @IsOptional() @IsBoolean() force?: boolean;
}

export class AnswerParamsDto {
  @IsString() jobId!: string;

  @IsIn(ANSWER_KINDS, { message: 'Loại câu hỏi không hợp lệ' })
  kind!: AnswerKindParam;

  @Type(() => Number)
  @IsInt({ message: 'Số thứ tự câu hỏi không hợp lệ' })
  @Min(0)
  @Max(50)
  index!: number;
}

export class SaveAnswerDto {
  @IsString({ message: 'Thiếu câu trả lời' })
  @Length(0, 4000, { message: 'Câu trả lời quá dài (tối đa 4.000 ký tự)' })
  text!: string;
}

export class FeedbackAnswerDto {
  @IsString({ message: 'Thiếu câu trả lời' })
  @Length(20, 4000, {
    message: 'Câu trả lời cần từ 20 tới 4.000 ký tự mới nhận xét được',
  })
  text!: string;
}
