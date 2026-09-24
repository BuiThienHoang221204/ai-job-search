import type { ModelMessage, streamText } from 'ai';
import type { ZodType } from 'zod';

/** Ai gọi và gọi để làm gì. Bắt buộc: thiếu nó thì nhật ký chỉ cho biết "có lỗi" mà không cho biết tác vụ nào đang hỏng. */
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
  timeoutMs?: number;
};

/** Khai tường minh chứ KHÔNG suy từ `AiService` bằng `Pick<>`: suy ra thì `FakeAi` phải chạy theo bất cứ thứ gì class thật vừa đổi. */
export interface Ai {
  generateObject<T>(
    options: GenerateObjectOptions<T>,
  ): Promise<{ object: T; modelId: string }>;
  streamText(
    options: StreamTextOptions,
  ): Promise<{ modelId: string; result: StreamTextResult }>;
  streamObject<T>(
    options: StreamObjectOptions<T>,
  ): Promise<StreamObjectResult<T>>;
}

/** Một model như model catalog mô tả nó. `tool_call` là tên của nguồn, giữ nguyên để so được với payload gốc. */
export type CatalogModel = {
  id: string;
  name: string;
  tool_call?: boolean;
  provider?: { npm?: string; api?: string };
};

export type CatalogProvider = {
  id: string;
  name: string;
  api?: string;
  npm?: string;
  models: Record<string, CatalogModel>;
};

/** Đủ thứ để dựng một đối tượng model của SDK. */
export type ResolvedModel = {
  providerId: string;
  model: CatalogModel;
  baseURL: string;
  apiKey: string;
  /** Header thêm vào mỗi request. Rỗng với hầu hết lõi — xem `userAgentEnv`. */
  headers: Record<string, string>;
  explicitStreamFlag: boolean;
  honorsResponseFormat: boolean;
  /** Model NÀY stream ra JSON parse dần được. Chỉ có nghĩa khi `honorsResponseFormat` là `false`. */
  streamsJson: boolean;
};

/** Một dòng trong màn quản trị chọn model. `structuredOutput` là `null` khi gateway không khai gì. */
export type ModelListing = {
  id: string;
  ref: string;
  name: string;
  toolCall: boolean;
  structuredOutput: boolean | null;
};
