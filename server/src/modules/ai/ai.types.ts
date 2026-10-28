import type { ModelMessage, streamText } from 'ai';
import type { ZodType } from 'zod';

export type AiCallContext = {
  purpose: string;
  userId?: string;
  redactResponse?: boolean;
};

export type GenerateObjectOptions<T> = {
  schema: ZodType<T>;
  system: string;
  prompt: string;
  context: AiCallContext;
  modelId?: string;
  fallbackModelIds?: string[];
  maxRetries?: number;
  timeoutMs?: number;
  maxOutputTokens?: number;
};

export type StreamTextResult = ReturnType<typeof streamText>;

export type StreamObjectOptions<T> = Omit<
  GenerateObjectOptions<T>,
  'maxRetries'
>;

export type StreamObjectResult<T> = {
  modelId: string;
  partials: AsyncIterable<unknown>;
  object: Promise<T>;
};

export type StreamTextOptions = {
  system: string;
  messages: ModelMessage[];
  modelId?: string;
  context: AiCallContext;
  timeoutMs?: number;
};

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

export type CatalogModel = {
  id: string;
  name: string;
  provider?: { npm?: string; api?: string };
  structured_output?: boolean;
};

export type CatalogProvider = {
  id: string;
  name: string;
  api?: string;
  npm?: string;
  models: Record<string, CatalogModel>;
};

export type ResolvedModel = {
  providerId: string;
  model: CatalogModel;
  baseURL: string;
  apiKey: string;
  headers: Record<string, string>;
  explicitStreamFlag: boolean;
  dropJsonMode: boolean;
  honorsResponseFormat: boolean;
  streamsJson: boolean;
};
