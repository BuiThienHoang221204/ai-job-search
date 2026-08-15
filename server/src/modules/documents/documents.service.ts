import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  Document,
  DocumentKind,
  Job,
  Prisma,
  Profile,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AiService } from '../ai/ai.service.js';
import { PromptBuilderService } from '../skills/prompt-builder.service.js';
import { SkillRegistryService } from '../skills/skill-registry.service.js';
import {
  STORAGE,
  userKey,
  type Storage,
} from '../storage/storage.interface.js';
import {
  coverLetterSchema,
  cvSchema,
  formAnswerSchema,
  type CoverLetterResult,
  type CvContentResult,
  type FormAnswerResult,
} from './document.schema.js';
import { LATEX_COMPILER, type LatexCompiler } from './latex-compile.js';
import {
  renderCoverLetter,
  renderCv,
  slugify,
  type Identity,
} from './latex.js';

const SKILL_NAME = 'job-application-assistant';

/** Timeout cho việc soạn CV và thư xin việc. */
const DOCUMENT_TIMEOUT_MS = 180_000;

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly skills: SkillRegistryService,
    private readonly prompts: PromptBuilderService,
    @Inject(STORAGE) private readonly storage: Storage,
    @Inject(LATEX_COMPILER) private readonly latex: LatexCompiler,
  ) {}

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

  private async generateCv(
    document: Document,
    profile: Profile | null,
    job: Job | null,
  ) {
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
      job
        ? [
            '=== VỊ TRÍ NHẮM TỚI ===',
            `${job.title} @ ${job.company}`,
            job.description,
          ].join('\n')
        : '=== KHÔNG CÓ VỊ TRÍ CỤ THỂ: soạn CV tổng quát theo định hướng nghề nghiệp ===',
    ].join('\n');

    const { object, modelId } = await this.ai.generateObject<CvContentResult>({
      schema: cvSchema,
      context: { purpose: 'document.cv', userId: document.userId },
      system,
      prompt,
      timeoutMs: DOCUMENT_TIMEOUT_MS,
    });

    const storageKey = await this.renderAndStore(
      document,
      profile,
      job,
      object,
    );
    return { content: object, storageKey, modelId };
  }

  private async generateCoverLetter(
    document: Document,
    profile: Profile | null,
    job: Job | null,
  ) {
    if (!job) {
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

    const match = await this.prisma.jobMatch.findUnique({
      where: { userId_jobId: { userId: document.userId, jobId: job.id } },
    });

    const prompt = [
      '=== HỒ SƠ ỨNG VIÊN ===',
      this.prompts.profileSummary(profile),
      match?.strengths.length
        ? `\nThế mạnh đã xác định khi chấm điểm: ${match.strengths.join('; ')}`
        : '',
      match?.gaps.length
        ? `Khoảng trống cần xử lý khéo trong thư: ${match.gaps.join('; ')}`
        : '',
      '',
      '=== VỊ TRÍ ỨNG TUYỂN ===',
      `${job.title} @ ${job.company}`,
      job.description,
    ].join('\n');

    const { object, modelId } = await this.ai.generateObject<CoverLetterResult>(
      {
        schema: coverLetterSchema,
        context: { purpose: 'document.coverLetter', userId: document.userId },
        system,
        prompt,
        timeoutMs: DOCUMENT_TIMEOUT_MS,
      },
    );

    const storageKey = await this.renderAndStore(
      document,
      profile,
      job,
      object,
    );
    return { content: object, storageKey, modelId };
  }

  /** Render `content` thành `.tex` rồi ghi vào Storage. **KHÔNG gọi AI.** */
  private async renderAndStore(
    document: Document,
    profile: Profile | null,
    job: Job | null,
    content: unknown,
  ): Promise<string> {
    const identity = await this.identity(document.userId, profile);

    if (document.kind === 'CV') {
      const cv = content as CvContentResult;
      const tex = renderCv(identity, {
        ...cv,
        experiences: cv.experiences.map((experience) => ({
          ...experience,
          location: experience.location ?? '',
        })),
        educations: cv.educations.map((education) => ({
          ...education,
          period: education.period ?? '',
          detail: education.detail ?? '',
        })),
      });

      const key = userKey(
        document.userId,
        'cv',
        `main_${slugify(job ? `${job.company}_${job.title}` : 'tong-quat')}.tex`,
      );
      await this.storage.write(key, tex);
      return key;
    }

    if (document.kind === 'COVER_LETTER') {
      if (!job) {
        throw new NotFoundException(
          'Thư xin việc bắt buộc phải gắn với một công việc',
        );
      }
      const tex = renderCoverLetter(
        identity,
        job.company,
        job.title,
        content as CoverLetterResult,
      );

      const key = userKey(
        document.userId,
        'cover_letters',
        `cover_${slugify(`${job.company}_${job.title}`)}.tex`,
      );
      await this.storage.write(key, tex);
      return key;
    }

    throw new UnprocessableEntityException(
      `Tài liệu loại ${document.kind} không có bản LaTeX để render lại.`,
    );
  }

  /** Render lại `.tex` từ `content` đã lưu, KHÔNG gọi model. */
  async rerender(userId: string, documentId: string): Promise<Document> {
    const document = await this.get(userId, documentId);

    if (document.status !== 'DONE' || !document.content) {
      throw new UnprocessableEntityException(
        `Tài liệu đang ở trạng thái ${document.status} và chưa có nội dung để render lại.`,
      );
    }

    const [profile, job] = await Promise.all([
      this.prisma.profile.findUnique({ where: { userId: document.userId } }),
      document.jobId
        ? this.prisma.job.findUnique({ where: { id: document.jobId } })
        : Promise.resolve(null),
    ]);

    const storageKey = await this.renderAndStore(
      document,
      profile,
      job,
      document.content,
    );

    return this.prisma.document.update({
      where: { id: documentId },
      data: { storageKey },
    });
  }

  private async generateFormAnswer(
    document: Document,
    profile: Profile | null,
    job: Job | null,
    question: string,
    characterLimit?: number,
  ) {
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
      job
        ? `=== VỊ TRÍ ===\n${job.title} @ ${job.company}\n${job.description}`
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
      storageKey: null,
      modelId,
    };
  }

  private async identity(
    userId: string,
    profile: Profile | null,
  ): Promise<Identity> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { name: true, email: true },
    });
    return {
      name: user.name,
      email: user.email,
      location: profile?.location ?? null,
      title: profile?.headline ?? null,
      phone: null,
    };
  }

  /** Sinh nội dung cho một tài liệu đã tạo. */
  async generate(userId: string, documentId: string): Promise<Document> {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, userId },
    });
    if (!document)
      throw new NotFoundException(`Không tìm thấy tài liệu: ${documentId}`);

    await this.prisma.document.update({
      where: { id: documentId },
      data: { status: 'RUNNING', error: null },
    });

    try {
      const [profile, job] = await Promise.all([
        this.prisma.profile.findUnique({ where: { userId: document.userId } }),
        document.jobId
          ? this.prisma.job.findUnique({ where: { id: document.jobId } })
          : Promise.resolve(null),
      ]);

      const params = (document.content ?? {}) as {
        question?: string;
        characterLimit?: number;
      };

      const result =
        document.kind === 'CV'
          ? await this.generateCv(document, profile, job)
          : document.kind === 'COVER_LETTER'
            ? await this.generateCoverLetter(document, profile, job)
            : await this.generateFormAnswer(
                document,
                profile,
                job,
                params.question ?? 'Hãy giới thiệu về bản thân.',
                params.characterLimit,
              );

      return await this.prisma.document.update({
        where: { id: documentId },
        data: {
          status: 'DONE',
          content: result.content,
          storageKey: result.storageKey,
          modelId: result.modelId,
          generatedAt: new Date(),
          error: null,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Sinh tài liệu thất bại (${documentId}): ${message}`);
      return this.prisma.document.update({
        where: { id: documentId },
        data: { status: 'FAILED', error: message },
      });
    }
  }

  create(
    userId: string,
    kind: DocumentKind,
    title: string,
    jobId?: string,
    params?: Prisma.InputJsonValue,
  ) {
    return this.prisma.document.create({
      data: {
        userId,
        kind,
        title,
        jobId: jobId ?? null,
        content: params ?? undefined,
      },
    });
  }

  list(userId: string, kind?: DocumentKind) {
    return this.prisma.document.findMany({
      where: { userId, ...(kind ? { kind } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        kind: true,
        status: true,
        title: true,
        storageKey: true,
        createdAt: true,
        generatedAt: true,
        error: true,
        job: { select: { id: true, title: true, company: true } },
      },
    });
  }

  async get(userId: string, id: string) {
    const document = await this.prisma.document.findFirst({
      where: { id, userId },
      include: { job: { select: { id: true, title: true, company: true } } },
    });
    if (!document)
      throw new NotFoundException(`Không tìm thấy tài liệu: ${id}`);
    return document;
  }

  /**
   * Đọc file .tex từ Storage. Khóa luôn bắt đầu bằng userId nên không thể đọc
   * chéo workspace của người khác.
   */
  async source(userId: string, id: string): Promise<string> {
    const document = await this.get(userId, id);
    if (!document.storageKey) {
      throw new NotFoundException('Tài liệu này không có file nguồn');
    }
    return this.storage.readText(document.storageKey);
  }

  /** Compile tài liệu ra PDF và trả về bytes. */
  async pdf(userId: string, id: string): Promise<Buffer> {
    const tex = await this.source(userId, id);
    const result = await this.latex.compile(tex);

    if (!result.ok) {
      throw new UnprocessableEntityException(result.reason);
    }

    if (result.warnings.length > 0) {
      this.logger.warn(
        `PDF ${id} thiếu ${result.warnings.length} ký tự font: ${result.warnings.join(', ')}`,
      );
    }

    return result.pdf;
  }
}
