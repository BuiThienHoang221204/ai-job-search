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
} from '../schemas/document.schema.js';
import type { OutputLanguage } from '../../../common/model-output.js';
import type { Identity } from '../content.types.js';
import type { DocumentParams, LetterTarget } from '../utils/letter-target.js';
import {
  applicationEmailPrompt,
  coverLetterPrompt,
  cvPrompt,
  DOCUMENT_TIMEOUT_MS,
  formAnswerPrompt,
  CV_SECTIONS,
  FORM_SECTIONS,
  LETTER_SECTIONS,
  WRITING_SECTIONS,
} from '../utils/document.prompt.js';

const SKILL_NAME = 'job-application-assistant';

const documentLanguage = (document: Document): OutputLanguage =>
  document.language === 'EN' ? 'en' : 'vi';

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

/** Soạn NỘI DUNG, không biết gì về LaTeX/Storage/trạng thái — nhờ vậy kiểm prompt chỉ cần `FakeAi`. */
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

  /** Một mục của file skill, đã điền token `[YOUR_*]` từ hồ sơ. */
  private section(file: string, keep: string[], profile: Profile | null) {
    const skill = this.skills.get(SKILL_NAME);
    return this.prompts.render(
      this.prompts.keepSections(skill.references.get(file) ?? '', keep),
      profile,
    );
  }

  /** Quy tắc viết lách dùng chung cho cả CV lẫn thư xin việc. */
  private writingRules(profile: Profile | null): string {
    return this.section('03-writing-style.md', WRITING_SECTIONS, profile);
  }

  /** Thế mạnh và khoảng trống lượt chấm điểm đã tìm ra; JD dán tay không có tin nào để tra nên trả rỗng. */
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
  ): { system: string; prompt: string; language: OutputLanguage } {
    const language = documentLanguage(document);

    const { system, prompt } = cvPrompt(
      {
        framework: this.section('05-cv-templates.md', CV_SECTIONS, profile),
        writingRules: this.writingRules(profile),
        profileSummary: this.prompts.profileSummary(profile),
      },
      target,
      language,
    );

    return { system, prompt, language };
  }

  private async cv(
    document: Document,
    profile: Profile | null,
    target: LetterTarget | null,
  ): Promise<ComposeResult> {
    const { system, prompt, language } = this.cvPrompt(
      document,
      profile,
      target,
    );

    const { object, modelId } = await this.ai.generateObject<CvContentResult>({
      schema: cvSchema(language),
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
    const { system, prompt, language } = this.cvPrompt(
      document,
      profile,
      target,
    );

    return this.ai.streamObject<CvContentResult>({
      schema: cvSchema(language),
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

    return coverLetterPrompt(
      {
        framework: this.section(
          '06-cover-letter-templates.md',
          LETTER_SECTIONS,
          profile,
        ),
        writingRules: this.writingRules(profile),
        profileSummary: this.prompts.profileSummary(profile),
        matchHints: await this.matchHints(document.userId, target),
      },
      target,
    );
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

  /** Khác thư xin việc: có tiêu đề mail, ngắn hơn một nửa, và chữ ký do CODE ghép chứ không hỏi model. */
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

    const { system, prompt } = applicationEmailPrompt(
      {
        framework: this.section(
          '06-cover-letter-templates.md',
          LETTER_SECTIONS,
          profile,
        ),
        writingRules: this.writingRules(profile),
        profileSummary: this.prompts.profileSummary(profile),
        matchHints: await this.matchHints(document.userId, target),
      },
      target,
      identity.name,
    );

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
    const { system, prompt } = formAnswerPrompt(
      {
        framework: this.section(
          '08-application-forms.md',
          FORM_SECTIONS,
          profile,
        ),
        profileSummary: this.prompts.profileSummary(profile),
      },
      target,
      question,
      characterLimit,
    );

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
