import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  QUEUE,
  QueueService,
  type ProfileSynthesizePayload,
} from '../queue/queue.service.js';
import { ProfileSynthesizerService } from './profile-synthesizer.service.js';

@Injectable()
export class ProfileDraftProcessor implements OnModuleInit {
  private readonly logger = new Logger(ProfileDraftProcessor.name);

  constructor(
    private readonly queue: QueueService,
    private readonly synthesizer: ProfileSynthesizerService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.work<ProfileSynthesizePayload>(
      QUEUE.PROFILE_SYNTHESIZE,
      async (data) => {
        this.logger.log(`Đọc hồ sơ từ bản nháp ${data.draftId}`);
        await this.synthesizer.synthesize(data.draftId);
      },
    );
  }
}
