import { PickType } from '@nestjs/swagger';
import { UpdateProfileDto } from '../profile/profile.dto';
import { APPLICABLE_FIELDS } from './utils/profile-draft.utils';

export class ApplyDraftDto extends PickType(
  UpdateProfileDto,
  APPLICABLE_FIELDS,
) {}
