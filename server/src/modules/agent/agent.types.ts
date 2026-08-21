import type { Ai } from '../ai/services/ai.service.js';
import type { LatexCompiler } from '../documents/latex-compile.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { PromptBuilderService } from '../skills/services/prompt-builder.service.js';
import type { SkillRegistryService } from '../skills/services/skill-registry.service.js';
import type { Storage } from '../storage/storage.interface.js';

/** Đầu vào người dùng đưa cho một lượt chạy. Lưu nguyên vào `AgentRun.input`. */
export type AgentInput = {
  jobUrl?: string;
  jobDescription?: string;
  note?: string;
};

/** Câu mở đầu gồm đầu vào của người dùng và bối cảnh gom từ database. */
export type OpeningInput = AgentInput & {
  /** Kết quả của `AgentContextService.build`. Rỗng khi không có gì để thêm. */
  context?: string;
};

/** Ngữ cảnh của một lượt chạy, để tool biết nó đang làm việc cho ai. */
export type ToolContext = {
  runId: string;
  userId: string;
  /**
   * URL do NGƯỜI DÙNG đưa. Đây là URL duy nhất được phép tải mà không cần suy
   * xét gì thêm; mọi URL khác model thấy trong thân tin tuyển dụng đều là do
   * bên thứ ba viết ra.
   */
  sourceUrl?: string;
};

/**
 * Những nguồn agent ĐÃ đọc trong lượt chạy này.
 *
 * Tồn tại vì dặn bằng lời không ăn thua: system prompt đã có câu "đừng đọc lại
 * thứ đã đọc", và ở lượt chạy thật model vẫn đọc `03-writing-style.md` hai lần
 * rồi lưu cùng một CV dưới hai cái tên. Chặn ở tool thì nó không đọc lại được,
 * chứ không phải được nhắc là đừng.
 *
 * Chỉ sống trong MỘT lượt gọi `runTools`. Lượt chạy tiếp bắt đầu với sổ trống -
 * nội dung cũ vẫn nằm trong hội thoại nên vẫn hơi phí, nhưng dò lại nó từ
 * `messages` là công việc của một bộ phân tích, không đáng cho hai ba bước.
 */
export type ReadLog = Set<string>;

/** File agent đã ghi ra trong một lượt chạy. */
export type ArtifactRecord = {
  name: string;
  key: string;
  bytes: number;
};

/**
 * Mọi con số chặn của agent, đọc một lần từ cấu hình rồi truyền xuống.
 *
 * Gom lại thành một object thay vì để từng tool tự hỏi `ConfigService`: tool là
 * hàm thuần nhận phụ thuộc, nên chúng test được mà không cần dựng Nest, và mọi
 * trần nằm cạnh nhau nên không ai chỉnh một cái mà quên cái liên quan.
 */
export type AgentLimits = {
  maxSteps: number;
  reviewerMaxSteps: number;
  timeoutMs: number;
  fetchTimeoutMs: number;
  fetchMaxBytes: number;
  templatesRoot: string;
  search: { apiKey: string; url: string; maxResults: number };
};

/** Phụ thuộc mà các tool cần. Tool nhận vào, không tự dựng. */
export type ToolDeps = {
  prisma: PrismaService;
  ai: Ai;
  skills: SkillRegistryService;
  prompts: PromptBuilderService;
  storage: Storage;
  latex: LatexCompiler;
  limits: AgentLimits;
};
