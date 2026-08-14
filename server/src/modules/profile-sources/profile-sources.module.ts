import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { CvPdfSource } from './cv-pdf.source.js';
import { ProfileDraftController } from './profile-draft.controller.js';
import { ProfileDraftProcessor } from './profile-draft.processor.js';
import { ProfileDraftService } from './profile-draft.service.js';
import { ProfileSynthesizerService } from './profile-synthesizer.service.js';

/**
 * SEAM 3 · đọc hồ sơ từ nguồn ngoài — Agent 1 của đề tài.
 *
 * `CvPdfSource` là adapter đầu tiên. Hai adapter tiếp theo đã nằm trong lộ trình
 * (GitHub, file export LinkedIn) nên seam này là thật chứ không phải trừu tượng
 * hoá phòng xa — đúng nguyên tắc "chỉ tạo seam khi có adapter thứ hai".
 *
 * Adapter đăng ký làm provider riêng lẻ chứ chưa gom thành mảng: với một adapter
 * thì một mảng inject chỉ là thêm gián tiếp mà không thêm khả năng nào. Gom lại
 * khi adapter thứ hai xuất hiện, lúc đó nó mới trả lời được một câu hỏi thật
 * ("chạy tất cả nguồn người dùng đã nối").
 */
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
