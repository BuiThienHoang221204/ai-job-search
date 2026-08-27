import { Injectable, NotFoundException } from '@nestjs/common';
import type { Document, Profile } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AiService } from '../../ai/services/ai.service.js';
import { PromptBuilderService } from '../../skills/services/prompt-builder.service.js';
import { SkillRegistryService } from '../../skills/services/skill-registry.service.js';
import {
  applicationEmailSchema,
  coverLetterSchema,
  cvSchema,
  formAnswerSchema,
  type ApplicationEmailResult,
  type CoverLetterResult,
  type CvContentResult,
  type FormAnswerResult,
} from '../document.schema.js';
import type { Identity } from '../latex.js';
import type { DocumentParams, LetterTarget } from '../letter-target.js';

const SKILL_NAME = 'job-application-assistant';

/** Timeout cho việc soạn CV và thư xin việc. */
const DOCUMENT_TIMEOUT_MS = 180_000;

export interface ComposeInput {
  document: Document;
  profile: Profile | null;
  target: LetterTarget | null;
  params: DocumentParams;
  /** Danh tính đã tra sẵn. Mail ứng tuyển ghép chữ ký từ đây, KHÔNG hỏi model. */
  identity: Identity;
}

export interface ComposeResult {
  /** Hình dạng khác nhau theo `document.kind`; caller ghi thẳng vào `content`. */
  content: unknown;
  modelId: string;
}

/**
 * Soạn NỘI DUNG của một tài liệu. Đây là toàn bộ phần chạm tới model.
 *
 * Cố ý không biết gì về LaTeX, Storage hay trạng thái bản ghi: nhận dữ liệu đã
 * tra sẵn, trả về nội dung. Nhờ vậy kiểm được prompt bằng `FakeAi` mà không
 * phải dựng Storage lẫn bộ compile LaTeX - trước khi tách, mọi bài kiểm tra về
 * câu chữ trong prompt đều phải giả lập sáu phụ thuộc.
 */
@Injectable()
export class DocumentComposer {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly skills: SkillRegistryService,
    private readonly prompts: PromptBuilderService,
  ) {}

  /** Chọn cây bút theo loại tài liệu. Mỗi nhánh là một lời gọi model. */
  compose(input: ComposeInput): Promise<ComposeResult> {
    const { document, profile, target, params, identity } = input;

    switch (document.kind) {
      case 'CV':
        return this.cv(document, profile, target);
      case 'COVER_LETTER':
        return this.coverLetter(document, profile, target);
      case 'APPLICATION_EMAIL':
        return this.applicationEmail(document, profile, target, identity);
      case 'FORM_ANSWER':
        return this.formAnswer(
          document,
          profile,
          target,
          params.question ?? 'Hãy giới thiệu về bản thân.',
          params.characterLimit,
        );
    }
  }

  /** Quy tắc viết lách dùng chung cho cả CV lẫn thư xin việc. */
  private writingRules(profile: Profile | null): string {
    const skill = this.skills.get(SKILL_NAME);
    return this.prompts.render(
      this.prompts.keepSections(
        skill.references.get('03-writing-style.md') ?? '',
        ['critical rules', 'tone', 'bullet point style'],
      ),
      profile,
    );
  }

  private groundingRules(): string[] {
    return [
      'Quy tắc không được phá:',
      '- Mọi câu phải được chứng minh bằng thông tin CÓ THẬT trong hồ sơ. Không thêm công ty, chức danh, con số, chứng chỉ hay kỹ năng không có trong đó.',
      '- Được phép viết lại cách diễn đạt, đổi thứ tự, chọn lọc thông tin để bám yêu cầu công việc. KHÔNG được phép thêm sự kiện mới.',
      '- Hồ sơ thiếu dữ liệu cho một yêu cầu nào đó thì bỏ qua yêu cầu đó, không lấp chỗ trống bằng phỏng đoán.',
      '- Viết tiếng Việt có dấu. Không dùng dấu gạch ngang dài, không dùng sáo ngữ.',
    ];
  }

  /**
   * Thế mạnh và khoảng trống mà lượt chấm điểm đã tìm ra, để thư không phải suy
   * lại từ đầu. JD dán tay không có tin nào để tra nên trả về mảng rỗng.
   */
  private async matchHints(
    userId: string,
    target: LetterTarget,
  ): Promise<string[]> {
    if (!target.jobId) return [];

    const match = await this.prisma.jobMatch.findUnique({
      where: { userId_jobId: { userId, jobId: target.jobId } },
    });

    return [
      match?.strengths.length
        ? `\nThế mạnh đã xác định khi chấm điểm: ${match.strengths.join('; ')}`
        : '',
      match?.gaps.length
        ? `Khoảng trống cần xử lý khéo trong thư: ${match.gaps.join('; ')}`
        : '',
    ];
  }

  private cvPrompt(
    document: Document,
    profile: Profile | null,
    target: LetterTarget | null,
  ): { system: string; prompt: string } {
    const skill = this.skills.get(SKILL_NAME);
    const framework = this.prompts.render(
      this.prompts.keepSections(
        skill.references.get('05-cv-templates.md') ?? '',
        ['section-by-section tailoring'],
      ),
      profile,
    );

    const system = [
      'Bạn là chuyên gia viết CV. Soạn nội dung CV bám sát một vị trí cụ thể.',
      '',
      ...this.groundingRules(),
      '- Dự án trong hồ sơ phải nằm ở mục projects. KHÔNG được viết dự án thành một mục kinh nghiệm làm việc: cả người đọc lẫn máy đọc CV sẽ hiểu nhầm thành nhiều nơi làm việc khác nhau.',
      '- Chọn 3-4 dự án bám sát tin tuyển dụng nhất, không liệt kê hết. Hồ sơ không có dự án nào thì để projects là mảng rỗng.',
      '- Trường tools của dự án là công cụ hoặc phương pháp thuộc NGÀNH của ứng viên, không mặc định là công nghệ phần mềm. Hồ sơ không nêu thì để rỗng.',
      '',
      '--- HƯỚNG DẪN TỪNG MỤC ---',
      framework,
      '',
      '--- QUY TẮC VĂN PHONG ---',
      this.writingRules(profile),
    ].join('\n');

    const prompt = [
      '=== HỒ SƠ ỨNG VIÊN ===',
      this.prompts.profileSummary(profile),
      '',
      target
        ? [
            '=== VỊ TRÍ NHẮM TỚI ===',
            `${target.title} @ ${target.company}`,
            target.description,
          ].join('\n')
        : '=== KHÔNG CÓ VỊ TRÍ CỤ THỂ: soạn CV tổng quát theo định hướng nghề nghiệp ===',
    ].join('\n');

    return { system, prompt };
  }

  private async cv(
    document: Document,
    profile: Profile | null,
    target: LetterTarget | null,
  ): Promise<ComposeResult> {
    const { system, prompt } = this.cvPrompt(document, profile, target);

    const { object, modelId } = await this.ai.generateObject<CvContentResult>({
      schema: cvSchema,
      context: { purpose: 'document.cv', userId: document.userId },
      system,
      prompt,
      timeoutMs: DOCUMENT_TIMEOUT_MS,
    });

    return { content: object, modelId };
  }

  streamCv(
    document: Document,
    profile: Profile | null,
    target: LetterTarget | null,
  ) {
    const { system, prompt } = this.cvPrompt(document, profile, target);

    return this.ai.streamObject<CvContentResult>({
      schema: cvSchema,
      context: { purpose: 'document.cv', userId: document.userId },
      system,
      prompt,
      timeoutMs: DOCUMENT_TIMEOUT_MS,
    });
  }

  private async coverLetterPrompt(
    document: Document,
    profile: Profile | null,
    target: LetterTarget | null,
  ): Promise<{ system: string; prompt: string }> {
    if (!target) {
      throw new NotFoundException(
        'Thư xin việc bắt buộc phải gắn với một công việc',
      );
    }

    const skill = this.skills.get(SKILL_NAME);
    const framework = this.prompts.render(
      this.prompts.keepSections(
        skill.references.get('06-cover-letter-templates.md') ?? '',
        ['tailoring guidelines', 'checklist before finalizing'],
      ),
      profile,
    );

    const system = [
      'Bạn là chuyên gia viết thư xin việc.',
      '',
      ...this.groundingRules(),
      '- Thư dài tối đa một trang: tổng cộng không quá 4 đoạn.',
      '',
      '--- HƯỚNG DẪN ---',
      framework,
      '',
      '--- QUY TẮC VĂN PHONG ---',
      this.writingRules(profile),
    ].join('\n');

    const prompt = [
      '=== HỒ SƠ ỨNG VIÊN ===',
      this.prompts.profileSummary(profile),
      ...(await this.matchHints(document.userId, target)),
      '',
      '=== VỊ TRÍ ỨNG TUYỂN ===',
      `${target.title} @ ${target.company}`,
      target.description,
    ].join('\n');

    return { system, prompt };
  }

  private async coverLetter(
    document: Document,
    profile: Profile | null,
    target: LetterTarget | null,
  ): Promise<ComposeResult> {
    const { system, prompt } = await this.coverLetterPrompt(
      document,
      profile,
      target,
    );

    const { object, modelId } = await this.ai.generateObject<CoverLetterResult>(
      {
        schema: coverLetterSchema,
        context: { purpose: 'document.coverLetter', userId: document.userId },
        system,
        prompt,
        timeoutMs: DOCUMENT_TIMEOUT_MS,
      },
    );

    return { content: object, modelId };
  }

  async streamCoverLetter(
    document: Document,
    profile: Profile | null,
    target: LetterTarget | null,
  ) {
    const { system, prompt } = await this.coverLetterPrompt(
      document,
      profile,
      target,
    );

    return this.ai.streamObject<CoverLetterResult>({
      schema: coverLetterSchema,
      context: { purpose: 'document.coverLetter', userId: document.userId },
      system,
      prompt,
      timeoutMs: DOCUMENT_TIMEOUT_MS,
    });
  }

  /**
   * Mail ứng tuyển gửi thẳng cho nhà tuyển dụng.
   *
   * Khác thư xin việc ở ba chỗ, và cả ba đều nằm trong prompt chứ không phải
   * trong cách trình bày: có tiêu đề mail, ngắn hơn một nửa, và chữ ký do CODE
   * ghép từ hồ sơ chứ không để model viết.
   */
  private async applicationEmail(
    document: Document,
    profile: Profile | null,
    target: LetterTarget | null,
    identity: Identity,
  ): Promise<ComposeResult> {
    if (!target) {
      throw new NotFoundException(
        'Mail ứng tuyển cần một tin tuyển dụng hoặc một mô tả công việc dán tay',
      );
    }

    const skill = this.skills.get(SKILL_NAME);
    const framework = this.prompts.render(
      this.prompts.keepSections(
        skill.references.get('06-cover-letter-templates.md') ?? '',
        ['tailoring guidelines', 'checklist before finalizing'],
      ),
      profile,
    );

    const system = [
      'Bạn soạn MAIL ỨNG TUYỂN để ứng viên gửi thẳng cho nhà tuyển dụng, không phải thư xin việc đính kèm PDF.',
      '',
      ...this.groundingRules(),
      '- Mail được đọc trên điện thoại: tối đa 3 đoạn, tổng cộng 150-250 chữ. Dài hơn là hỏng, không phải là kỹ hơn.',
      '- Không kể lại toàn bộ CV. Chọn đúng hai tới ba điểm khớp nhất với tin này, phần còn lại để CV nói.',
      '- Không bịa tên người nhận, không bịa nguồn biết tin, không nêu mức lương nếu hồ sơ không có.',
      '- KHÔNG viết tên, email hay số điện thoại vào bất kỳ trường nào. Hệ thống tự ghép chữ ký từ hồ sơ.',
      '',
      '--- HƯỚNG DẪN ---',
      framework,
      '',
      '--- QUY TẮC VĂN PHONG ---',
      this.writingRules(profile),
    ].join('\n');

    const prompt = [
      '=== HỒ SƠ ỨNG VIÊN ===',
      `Tên ứng viên (dùng cho tiêu đề mail): ${identity.name}`,
      this.prompts.profileSummary(profile),
      ...(await this.matchHints(document.userId, target)),
      '',
      '=== VỊ TRÍ ỨNG TUYỂN ===',
      `${target.title} @ ${target.company}`,
      target.description,
    ].join('\n');

    const { object, modelId } =
      await this.ai.generateObject<ApplicationEmailResult>({
        schema: applicationEmailSchema,
        context: {
          purpose: 'document.applicationEmail',
          userId: document.userId,
        },
        system,
        prompt,
        timeoutMs: DOCUMENT_TIMEOUT_MS,
      });

    return {
      content: {
        ...object,
        company: target.company,
        position: target.title,
        // Chữ ký KHÔNG đi qua model: một số điện thoại bịa trong mail đã gửi đi
        // là thứ người dùng không có cách nào phát hiện.
        signature: {
          name: identity.name,
          email: identity.email,
          phone: identity.phone,
          title: identity.title,
        },
      },
      modelId,
    };
  }

  private async formAnswer(
    document: Document,
    profile: Profile | null,
    target: LetterTarget | null,
    question: string,
    characterLimit?: number,
  ): Promise<ComposeResult> {
    const skill = this.skills.get(SKILL_NAME);
    const framework = this.prompts.render(
      this.prompts.keepSections(
        skill.references.get('08-application-forms.md') ?? '',
        [
          'the rule that governs everything here',
          'field type: self-introduction paragraph',
          'field type: structured project entries',
          'field type: hard character limits',
        ],
      ),
      profile,
    );

    const system = [
      'Bạn soạn câu trả lời cho ô văn bản tự do trong form ứng tuyển trực tuyến.',
      '',
      ...this.groundingRules(),
      '- Ô form không phải chỗ để đưa ra thông tin mới. Đây là chỗ CHỌN LỌC từ những gì đã có và sắp xếp lại cho đúng câu hỏi.',
      characterLimit
        ? `- Giới hạn cứng: ${characterLimit} ký tự. Mọi phương án phải nằm trong giới hạn này.`
        : '- Không có giới hạn ký tự cụ thể, ưu tiên 100-200 từ.',
      '',
      '--- HƯỚNG DẪN ---',
      framework,
    ].join('\n');

    const prompt = [
      '=== HỒ SƠ ỨNG VIÊN ===',
      this.prompts.profileSummary(profile),
      '',
      target
        ? `=== VỊ TRÍ ===\n${target.title} @ ${target.company}\n${target.description}`
        : '',
      '',
      '=== CÂU HỎI TRONG FORM ===',
      question,
    ].join('\n');

    const { object, modelId } = await this.ai.generateObject<FormAnswerResult>({
      schema: formAnswerSchema,
      context: { purpose: 'document.formAnswer', userId: document.userId },
      system,
      prompt,
    });

    const answers = object.answers.map((answer) => ({
      ...answer,
      characterCount: [...answer.text].length,
      overLimit: characterLimit
        ? [...answer.text].length > characterLimit
        : false,
    }));

    return {
      content: {
        ...object,
        answers,
        question,
        characterLimit: characterLimit ?? null,
      },
      modelId,
    };
  }
}
