import type { Logger } from '@nestjs/common';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import { formatModelRef } from '../utils/model-ref.js';
import type { ModelCatalogService } from './model-catalog.service.js';

export type ResolvedLanguageModel = {
  model: LanguageModel;
  id: string;
  provider: string;
  /** Dạng `lõi/model`, chỉ để in ra nhật ký. */
  ref: string;
};

const FENCED_BLOCK = /^```[a-zA-Z]*[^\S\r\n]*\r?\n([\s\S]*?)\r?\n?```$/;

function unwrapFence(text: string): string {
  const match = FENCED_BLOCK.exec(text.trim());
  if (!match) return text;

  const inner = match[1].trim();
  try {
    JSON.parse(inner);
    return inner;
  } catch {
    return text;
  }
}

async function unwrapFencedJson(response: Response): Promise<Response> {
  if (!response.ok) return response;
  if (
    !(response.headers.get('content-type') ?? '').includes('application/json')
  )
    return response;

  const raw = await response.text();
  const rebuild = (body: string): Response =>
    new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });

  try {
    const payload = JSON.parse(raw) as {
      choices?: { message?: { content?: unknown } }[];
    };
    let changed = false;
    for (const choice of payload?.choices ?? []) {
      const content = choice?.message?.content;
      if (typeof content !== 'string') continue;

      const unwrapped = unwrapFence(content);
      if (unwrapped === content) continue;

      choice.message!.content = unwrapped;
      changed = true;
    }
    return rebuild(changed ? JSON.stringify(payload) : raw);
  } catch {
    return rebuild(raw);
  }
}

/** Mọi lõi đều chạy qua `createOpenAICompatible`, kể cả OpenRouter: API của nó là OpenAI-compatible nên không cần adapter thứ hai. */
export class LanguageModelFactory {
  constructor(
    private readonly catalog: ModelCatalogService,
    private readonly logger: Logger,
  ) {}

  async structuredOutputModeFor(
    modelId: string | undefined,
    fallbackDefault: boolean,
  ): Promise<{ providerId: string; structuredOutputs: boolean }> {
    const resolved = await this.catalog.resolve(modelId);
    return {
      providerId: resolved.providerId,
      structuredOutputs:
        resolved.honorsResponseFormat !== false && fallbackDefault,
    };
  }

  async create(
    modelId: string | undefined,
    structuredOutputs: boolean,
  ): Promise<ResolvedLanguageModel> {
    const resolved = await this.catalog.resolve(modelId);
    const userAgent = resolved.headers['User-Agent'];
    this.logger.debug(
      `AI headers cho ${resolved.model.id}: ${JSON.stringify(resolved.headers)}`,
    );

    const originalFetch = globalThis.fetch;
    const forceUserAgentFetch: typeof globalThis.fetch = async (
      input,
      init,
    ) => {
      const headers = new Headers(init?.headers);
      if (userAgent) {
        headers.set('User-Agent', userAgent);
      }
      let body = init?.body;
      if (resolved.explicitStreamFlag && typeof body === 'string') {
        try {
          const parsed = JSON.parse(body) as Record<string, unknown>;
          if (!('stream' in parsed)) {
            parsed.stream = false;
            body = JSON.stringify(parsed);
          }
        } catch {
          body = init?.body;
        }
      }
      const response = await originalFetch(input, { ...init, headers, body });
      return structuredOutputs ? response : unwrapFencedJson(response);
    };

    const provider = createOpenAICompatible({
      name: resolved.providerId,
      baseURL: resolved.baseURL,
      apiKey: resolved.apiKey,
      supportsStructuredOutputs: structuredOutputs,
      headers: resolved.headers,
      fetch: forceUserAgentFetch,
    });
    return {
      model: provider(resolved.model.id),
      id: resolved.model.id,
      provider: resolved.providerId,
      ref: formatModelRef({
        providerId: resolved.providerId,
        modelId: resolved.model.id,
      }),
    };
  }
}
