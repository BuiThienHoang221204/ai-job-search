import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { ProfileModule } from '../profile/profile.module';
import { StorageModule } from '../storage/storage.module';
import { CvPdfSource } from './cv-pdf.source';
import { ProfileDraftController } from './profile-draft.controller';
import { ProfileDraftProcessor } from './profile-draft.processor';
import { ProfileDraftService } from './services/profile-draft.service';
import { ProfileSynthesizerService } from './services/profile-synthesizer.service';

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
