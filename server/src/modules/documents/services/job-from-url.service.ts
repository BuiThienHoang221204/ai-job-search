import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { pageToText } from '../../../common/web/html-text.js';
import { fetchPage } from '../../../common/web/http-get.js';
import {
  webLimitsFrom,
  type WebLimits,
} from '../../../common/web/web-limits.js';
import { AiService } from '../../ai/services/ai.service.js';
import {
  jobFromUrlPrompt,
  JOB_FROM_URL_SYSTEM,
} from '../utils/job-from-url.prompt.js';
import {
  jobFromUrlSchema,
  type JobFromUrl,
} from '../schemas/job-source.schema.js';

/** Dưới mốc này thì trang không có nội dung thật, chỉ có khung. */
const THIN_PAGE = 800;

/** Trần chữ đưa vào prompt sau khi bóc HTML. */
const TEXT_LIMIT = 20_000;

/** Portal chặn máy chủ là chuyện thường, nên mọi nhánh hỏng đều chỉ sang đường dán chữ thay vì báo "hỏng". */
const PASTE_INSTEAD = 'Hãy copy nội dung tin rồi dán vào ô mô tả công việc.';

/** Bóc tin ra khỏi link rồi TRẢ CHO NGƯỜI DÙNG SOÁT; không ghi thành `Job`, xem README. */
@Injectable()
export class JobFromUrlService {
  private readonly logger = new Logger(JobFromUrlService.name);
  private readonly web: WebLimits;

  constructor(
    private readonly ai: AiService,
    config: ConfigService,
  ) {
    this.web = webLimitsFrom(config);
  }

  async extract(userId: string, url: string): Promise<JobFromUrl> {
    const text = await this.read(url);

    const { object } = await this.ai.generateObject<JobFromUrl>({
      schema: jobFromUrlSchema,
      context: { purpose: 'job.fromUrl', userId },
      system: JOB_FROM_URL_SYSTEM,
      prompt: jobFromUrlPrompt(text),
    });

    if (!object.title || !object.description) {
      throw new BadRequestException(
        `Không tìm thấy tin tuyển dụng nào trong trang này. ${PASTE_INSTEAD}`,
      );
    }

    return object;
  }

  /** Chữ của trang, hoặc một lỗi nói rõ phải làm gì tiếp. */
  private async read(url: string): Promise<string> {
    let page;
    try {
      page = await fetchPage(url, {
        timeoutMs: this.web.fetchTimeoutMs,
        maxBytes: this.web.fetchMaxBytes,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Không tải được ${url}: ${message}`);
      throw new BadRequestException(`${message} ${PASTE_INSTEAD}`);
    }

    if ([401, 403, 429].includes(page.status)) {
      throw new BadRequestException(
        `Trang này chặn truy cập từ máy chủ (HTTP ${page.status}). ${PASTE_INSTEAD}`,
      );
    }
    if (page.status < 200 || page.status >= 300) {
      throw new BadRequestException(
        `Máy chủ của trang trả về HTTP ${page.status}. ${PASTE_INSTEAD}`,
      );
    }

    const text = pageToText(page.body);
    if (text.length < THIN_PAGE) {
      throw new BadRequestException(
        `Trang này gần như không có chữ trong HTML (${text.length} ký tự), nhiều khả năng nội dung được render phía trình duyệt. ${PASTE_INSTEAD}`,
      );
    }

    return text.slice(0, TEXT_LIMIT);
  }
}
