import {
  BadRequestException,
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
import type { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { pageArgs, pageOf } from '../../common/pagination.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AiService } from '../ai/services/ai.service.js';
import { PromptBuilderService } from '../skills/services/prompt-builder.service.js';
import { SkillRegistryService } from '../skills/services/skill-registry.service.js';
import {
  STORAGE,
  userKey,
  type Storage,
} from '../storage/storage.interface.js';
import {
  applicationEmailSchema,
  coverLetterSchema,
  cvSchema,
  formAnswerSchema,
  type ApplicationEmailResult,
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

/**
 * Đích của một lá thư: viết cho công ty nào, vị trí nào, theo mô tả nào.
 *
 * Khái niệm này tồn tại vì cùng một việc soạn thảo có HAI nguồn tin tuyển dụng:
 * một tin đã nằm trong database, hoặc một JD người dùng dán tay mà hệ thống cố
 * ý không lưu lại thành tin (xem `createApplicationEmail`). Phần soạn thảo chỉ
 * cần ba trường dưới đây, nên nó không được phép biết nguồn nào - có vậy thêm
 * nguồn thứ ba sau này mới không phải sửa chỗ viết prompt.
 */
export interface LetterTarget {
  company: string;
  title: string;
  description: string;
  /** Id tin trong database. `null` = JD dán tay, không có tin nào để tra cứu. */
  jobId: string | null;
}

/**
 * Tham số người dùng nhập lúc bấm nút, cất tạm trong `Document.content` cho tới
 * khi worker chạy tới. Sinh xong thì `content` bị thay bằng kết quả của model.
 */
interface DocumentParams {
  question?: string;
  characterLimit?: number;
  jobDescription?: string;
  company?: string;
  title?: string;
}

/**
 * Tiêu đề dòng trong kho tài liệu. Cắt ngắn vì chức danh trên tin tuyển dụng có
 * thể dài cả dòng và danh sách chỉ có một dòng cho mỗi bản ghi.
 */
const emailTitle = (title: string, company: string): string =>
  `Mail ứng tuyển: ${title} - ${company}`.slice(0, 160);

/** Dựng đích của thư từ tin có sẵn, nếu không có thì từ JD dán tay. */
function letterTarget(
  job: Job | null,
  params: DocumentParams,
): LetterTarget | null {
  if (job) {
    return {
      company: job.company,
      title: job.title,
      description: job.description,
      jobId: job.id,
    };
  }

  if (params.jobDescription && params.company && params.title) {
    return {
      company: params.company,
      title: params.title,
      description: params.jobDescription,
      jobId: null,
    };
  }

  return null;
}

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
    target: LetterTarget | null,
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
      target
        ? [
            '=== VỊ TRÍ NHẮM TỚI ===',
            `${target.title} @ ${target.company}`,
            target.description,
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
      target,
      object,
    );
    return { content: object, storageKey, modelId };
  }

  private async generateCoverLetter(
    document: Document,
    profile: Profile | null,
    target: LetterTarget | null,
  ) {
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
      target,
      object,
    );
    return { content: object, storageKey, modelId };
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

  /**
   * Mail ứng tuyển gửi thẳng cho nhà tuyển dụng.
   *
   * Khác thư xin việc ở ba chỗ, và cả ba đều nằm trong prompt chứ không phải
   * trong cách trình bày: có tiêu đề mail, ngắn hơn một nửa, và chữ ký do CODE
   * ghép từ hồ sơ chứ không để model viết.
   */
  private async generateApplicationEmail(
    document: Document,
    profile: Profile | null,
    target: LetterTarget | null,
  ) {
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

    const identity = await this.identity(document.userId, profile);

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
      storageKey: null,
      modelId,
    };
  }

  /** Render `content` thành `.tex` rồi ghi vào Storage. **KHÔNG gọi AI.** */
  private async renderAndStore(
    document: Document,
    profile: Profile | null,
    target: LetterTarget | null,
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
        `main_${slugify(target ? `${target.company}_${target.title}` : 'tong-quat')}.tex`,
      );
      await this.storage.write(key, tex);
      return key;
    }

    if (document.kind === 'COVER_LETTER') {
      if (!target) {
        throw new NotFoundException(
          'Thư xin việc bắt buộc phải gắn với một công việc',
        );
      }
      const tex = renderCoverLetter(
        identity,
        target.company,
        target.title,
        content as CoverLetterResult,
      );

      const key = userKey(
        document.userId,
        'cover_letters',
        `cover_${slugify(`${target.company}_${target.title}`)}.tex`,
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
      letterTarget(job, {}),
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
    target: LetterTarget | null,
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
      // `Profile.phone` được thêm về sau, còn chỗ này thì kẹt ở `null` - nên CV
      // và chữ ký mail đều thiếu số điện thoại dù hồ sơ đã khai.
      phone: profile?.phone ?? null,
    };
  }

  /** Chọn cây bút theo loại tài liệu. Mỗi nhánh là một lời gọi model. */
  private generateByKind(
    document: Document,
    profile: Profile | null,
    target: LetterTarget | null,
    params: DocumentParams,
  ) {
    switch (document.kind) {
      case 'CV':
        return this.generateCv(document, profile, target);
      case 'COVER_LETTER':
        return this.generateCoverLetter(document, profile, target);
      case 'APPLICATION_EMAIL':
        return this.generateApplicationEmail(document, profile, target);
      case 'FORM_ANSWER':
        return this.generateFormAnswer(
          document,
          profile,
          target,
          params.question ?? 'Hãy giới thiệu về bản thân.',
          params.characterLimit,
        );
    }
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

      const params = (document.content ?? {}) as DocumentParams;
      const target = letterTarget(job, params);

      const result = await this.generateByKind(
        document,
        profile,
        target,
        params,
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

  /**
   * Tạo bản ghi mail ứng tuyển từ MỘT trong hai nguồn: một tin đã có trong hệ
   * thống, hoặc một mô tả công việc người dùng dán tay.
   *
   * JD dán tay cố ý KHÔNG được lưu thành `Job`. Bảng đó là kho dùng chung và
   * không có cột chủ sở hữu, nên một tin dán tay sẽ hiện trong danh sách việc
   * làm của MỌI người dùng. Nó nằm tạm trong `Document.content` cho tới khi
   * worker đọc ra, đúng cách `FORM_ANSWER` mang câu hỏi của mình.
   */
  async createApplicationEmail(
    userId: string,
    input: {
      jobId?: string;
      jobDescription?: string;
      company?: string;
      title?: string;
    },
  ): Promise<Document> {
    if (input.jobId) {
      const job = await this.prisma.job.findUnique({
        where: { id: input.jobId },
        select: { id: true, title: true, company: true },
      });
      if (!job) {
        throw new NotFoundException(
          `Không tìm thấy tin tuyển dụng: ${input.jobId}`,
        );
      }
      return this.create(
        userId,
        'APPLICATION_EMAIL',
        emailTitle(job.title, job.company),
        job.id,
      );
    }

    const { jobDescription, company, title } = input;
    // DTO đã chặn trường hợp này; kiểm lại ở đây để service tự đứng vững khi có
    // caller thứ hai, và để TypeScript thu hẹp được kiểu ngay bên dưới.
    if (!jobDescription || !company || !title) {
      throw new BadRequestException(
        'Cần chọn một tin tuyển dụng, hoặc dán mô tả công việc kèm tên công ty và vị trí',
      );
    }

    return this.create(
      userId,
      'APPLICATION_EMAIL',
      emailTitle(title, company),
      undefined,
      { jobDescription, company, title },
    );
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

  async list(
    userId: string,
    kind: DocumentKind | undefined,
    jobId: string | undefined,
    query: PaginationQueryDto,
  ) {
    const where = {
      userId,
      ...(kind ? { kind } : {}),
      ...(jobId ? { jobId } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.document.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...pageArgs(query),
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
      }),
      this.prisma.document.count({ where }),
    ]);

    return pageOf(items, total, query);
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
