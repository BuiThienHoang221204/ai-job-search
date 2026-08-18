import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { CvPdfSource } from './cv-pdf.source.js';
import { ProfileDraftController } from './profile-draft.controller.js';
import { ProfileDraftProcessor } from './profile-draft.processor.js';
import { ProfileDraftService } from './services/profile-draft.service.js';
import { ProfileSynthesizerService } from './services/profile-synthesizer.service.js';

/** SEAM 3 · đọc hồ sơ từ nguồn ngoài — Agent 1 của đề tài. */
@Module({
  imports: [AiModule, StorageModule],
  controllers: [ProfileDraftController],
  providers: [
    CvPdfSource,
    ProfileDraftService,
    ProfileSynthesizerService,
    ProfileDraftProcessor,
  ],
  exports: [ProfileDraftService],
})
export class ProfileSourcesModule {}
