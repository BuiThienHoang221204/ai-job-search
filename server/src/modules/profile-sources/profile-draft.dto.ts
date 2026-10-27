import { PickType } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';
import { UpdateProfileDto } from '../profile/profile.dto';
import { APPLICABLE_FIELDS } from './utils/profile-draft.utils';

export class ApplyDraftDto extends PickType(
  UpdateProfileDto,
  APPLICABLE_FIELDS,
) {}

export class ConfirmCvUploadDto {
  @Matches(/^cv-tmp\/[\w-]+\/[0-9a-f-]{36}\.pdf$/, {
    message: 'Mã file tải lên không hợp lệ. Hãy chọn lại file CV.',
  })
  key!: string;

  @IsString()
  @Length(1, 255, { message: 'Tên file phải từ 1 tới 255 ký tự' })
  filename!: string;
}
