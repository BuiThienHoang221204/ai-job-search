import type { ModelMessage, streamText, ToolSet } from 'ai';
import type { ZodType } from 'zod';

/**
 * Ai gọi và gọi để làm gì. Bắt buộc: không có nó thì nhật ký chỉ cho biết
 * "có lỗi" mà không cho biết tác vụ nào đang hỏng.
 */
export type AiCallContext = {
  purpose: string;
  userId?: string;
};

export type GenerateObjectOptions<T> = {
  schema: ZodType<T>;
  system: string;
  prompt: string;
  context: AiCallContext;
  modelId?: string;
  maxRetries?: number;
  timeoutMs?: number;
};

export type StreamTextResult = ReturnType<typeof streamText>;

export type StreamObjectOptions<T> = {
  schema: ZodType<T>;
  system: string;
  prompt: string;
  context: AiCallContext;
  modelId?: string;
  timeoutMs?: number;
};

export type StreamObjectResult<T> = {
  modelId: string;
  partials: AsyncIterable<unknown>;
  object: Promise<T>;
};

export type StreamTextOptions = {
  system: string;
  /** Một lượt hỏi rời. Loại trừ lẫn nhau với `messages`. */
  prompt?: string;
  /** Hội thoại nhiều lượt — buổi luyện phỏng vấn đi đường này. */
  messages?: ModelMessage[];
  modelId?: string;
  /** Để ghi vào `ai_calls`; thiếu nó thì lượt stream vô hình với màn quản trị. */
  context?: AiCallContext;
};

/**
 * Một bước của vòng lặp agent: model nói gì, gọi tool nào, tool trả về gì.
 *
 * Ghi lại TỪNG bước chứ không chỉ kết quả cuối, vì một agent chạy sai thường
 * sai ở giữa - gọi nhầm tool, hoặc nhận về rác rồi vẫn viết tiếp như thật.
 * Không có nhật ký bước thì không có cách nào biết nó sai ở đâu.
 */
export type AgentStepLog = {
  index: number;
  text: string;
  toolCalls: Array<{ tool: string; input: unknown }>;
  toolResults: Array<{ tool: string; output: unknown }>;
  durationMs: number;
  /**
   * Toàn bộ hội thoại TÍNH TỚI hết bước này, gồm cả câu hỏi mở đầu.
   *
   * Đây là điểm khôi phục: lượt chạy chết ở bước 5 vẫn còn nguyên trạng thái
   * sau bước 4, nên chạy tiếp không phải làm lại từ đầu. Không có nó thì một
   * lượt hết giờ mất trắng mọi thứ đã tốn tiền để dựng.
   */
  messages: ModelMessage[];
};

export type RunToolsOptions = {
  system: string;
  /** Lượt chạy MỚI dùng `prompt`; lượt chạy TIẾP dùng `messages`. */
  prompt?: string;
  messages?: ModelMessage[];
  tools: ToolSet;
  context: AiCallContext;
  modelId?: string;
  /**
   * Trần số bước. Đây là chặn cuối chống vòng lặp vô tận - model hoàn toàn có
   * thể gọi đi gọi lại một tool mãi mãi, và mỗi bước là một lượt gọi tính tiền.
   */
  maxSteps?: number;
  /** Hạn cho TOÀN BỘ vòng lặp, không phải cho một bước. */
  timeoutMs?: number;
  /**
   * Dừng vòng lặp ngay sau khi model gọi tool này.
   *
   * Dùng cho `ask_user`: agent hỏi xong thì phải nhả worker ra chứ không được
   * đứng chờ người dùng - câu trả lời có thể tới sau vài giờ, ở một request
   * khác. Lịch sử hội thoại trả về trong `messages` để nạp lại lúc đó.
   */
  stopOnTool?: string;
  /** Gọi sau mỗi bước, để nơi dùng ghi tiến trình xuống DB ngay lúc chạy. */
  onStep?: (step: AgentStepLog) => Promise<void>;
};

export type RunToolsResult = {
  text: string;
  steps: AgentStepLog[];
  finishReason: string;
  modelId: string;
  /** Toàn bộ hội thoại sau lượt chạy, để chạy tiếp về sau. */
  messages: ModelMessage[];
};

/**
 * Mặt tiếp xúc mà các module khác dùng để gọi model.
 *
 * Khai tường minh chứ KHÔNG suy ra từ `AiService` bằng `Pick<>` như bản cũ:
 * suy ra thì hợp đồng đi theo bản cài đặt, và `FakeAi` phải chạy theo bất cứ
 * thứ gì class thật vừa đổi. Khai ở đây thì cả hai adapter cùng bị soi theo
 * một bản khai, và đổi hợp đồng là một hành động có chủ đích.
 */
export interface Ai {
  generateObject<T>(
    options: GenerateObjectOptions<T>,
  ): Promise<{ object: T; modelId: string }>;
  runTools(options: RunToolsOptions): Promise<RunToolsResult>;
}
