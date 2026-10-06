import type { ModelMessage, streamText } from 'ai';
import type { ZodType } from 'zod';

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
  fallbackModelIds?: string[];
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
  fallbackModelIds?: string[];
  timeoutMs?: number;
};

export type StreamObjectResult<T> = {
  modelId: string;
  partials: AsyncIterable<unknown>;
  object: Promise<T>;
};

export type StreamTextOptions = {
  system: string;
  prompt?: string;
  messages?: ModelMessage[];
  modelId?: string;
  context?: AiCallContext;
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

export type ResolvedModel = {
  providerId: string;
  model: CatalogModel;
  baseURL: string;
  apiKey: string;
  headers: Record<string, string>;
  explicitStreamFlag: boolean;
  honorsResponseFormat: boolean;
  streamsJson: boolean;
  defaultMaxOutputTokens?: number;
};

export type ModelListing = {
  id: string;
  ref: string;
  name: string;
  toolCall: boolean;
  structuredOutput: boolean | null;
};
