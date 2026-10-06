import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { ProfileModule } from '../profile/profile.module';
import { StorageModule } from '../storage/storage.module';
import { CvPdfSource } from './cv-pdf.source';
import { ProfileDraftController } from './profile-draft.controller';
import { ProfileDraftProcessor } from './profile-draft.processor';
import { ProfileDraftService } from './services/profile-draft.service';
import { ProfileSynthesizerService } from './services/profile-synthesizer.service';

/** SEAM 3 · đọc hồ sơ từ nguồn ngoài — Agent 1 của đề tài. */
@Module({
  imports: [AiModule, ProfileModule, StorageModule],
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
