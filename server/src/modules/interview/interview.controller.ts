import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { PaginationQueryDto } from '@/common/dto/pagination.dto';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { AuthUser } from '@/common/types/auth-user';
import {
  AnswerParamsDto,
  FeedbackAnswerDto,
  PrepDto,
  SaveAnswerDto,
} from './interview.dto';
import { InterviewAnswersService } from './interview-answers.service';
import { InterviewService } from './interview.service';
import { KIND_OF_PARAM } from './utils/interview-answers';
import { ThrottleAi } from '@/common/throttle';

@ApiTags('Interview Preparation')
@ApiBearerAuth()
@Controller('interview')
export class InterviewController {
  constructor(
    private readonly interview: InterviewService,
    private readonly answers: InterviewAnswersService,
  ) {}

  @ApiOperation({
    summary: 'Lấy danh sách các tài liệu chuẩn bị phỏng vấn của người dùng',
  })
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: PaginationQueryDto) {
    return this.interview.list(user.id, query);
  }

  @ApiOperation({
    summary: 'Lấy tài liệu chuẩn bị phỏng vấn theo ID tin tuyển dụng',
  })
  @ApiParam({ name: 'jobId', description: 'ID của tin tuyển dụng' })
  @Get(':jobId')
  get(@CurrentUser() user: AuthUser, @Param('jobId') jobId: string) {
    return this.interview.get(user.id, jobId);
  }

  @ThrottleAi()
  @ApiOperation({
    summary: 'Đưa yêu cầu chuẩn bị phỏng vấn vào hàng đợi xử lý',
  })
  @Post('prep')
  async enqueue(@CurrentUser() user: AuthUser, @Body() dto: PrepDto) {
    return this.interview.enqueue(user.id, dto.jobId, dto.force ?? false);
  }

  @ApiOperation({
    summary: 'Lưu câu người dùng tự trả lời; chuỗi rỗng là xoá câu trả lời',
  })
  @Put(':jobId/answers/:kind/:index')
  saveAnswer(
    @CurrentUser() user: AuthUser,
    @Param() params: AnswerParamsDto,
    @Body() dto: SaveAnswerDto,
  ) {
    return this.answers.save(
      user.id,
      params.jobId,
      KIND_OF_PARAM[params.kind],
      params.index,
      dto.text,
    );
  }

  @ThrottleAi()
  @ApiOperation({
    summary: 'Lưu câu trả lời rồi nhờ AI nhận xét theo khung STAR',
  })
  @HttpCode(200)
  @Post(':jobId/answers/:kind/:index/feedback')
  feedback(
    @CurrentUser() user: AuthUser,
    @Param() params: AnswerParamsDto,
    @Body() dto: FeedbackAnswerDto,
  ) {
    return this.answers.feedback(
      user.id,
      params.jobId,
      KIND_OF_PARAM[params.kind],
      params.index,
      dto.text,
    );
  }
}
