import type { Logger } from '@nestjs/common';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import { formatModelRef } from '../model-ref.js';
import type { ModelCatalogService } from './model-catalog.service.js';

export type ResolvedLanguageModel = {
  model: LanguageModel;
  id: string;
  provider: string;
  /** Dạng `lõi/model`, chỉ để in ra nhật ký. */
  ref: string;
};

/**
 * Dựng đối tượng model của SDK từ một id.
 *
 * Mọi lõi đều chạy qua `createOpenAICompatible`, kể cả OpenRouter: API của nó
 * là OpenAI-compatible nên không cần adapter thứ hai. Cái thay đổi theo lõi
 * chỉ là `baseURL` và `apiKey`, và cả hai đến từ `catalog.resolve()`.
 */
export class LanguageModelFactory {
  constructor(
    private readonly catalog: ModelCatalogService,
    private readonly logger: Logger,
  ) {}

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
    const forceUserAgentFetch: typeof globalThis.fetch = (input, init) => {
      const headers = new Headers(init?.headers);
      if (userAgent) {
        headers.set('User-Agent', userAgent);
      }
      return originalFetch(input, { ...init, headers });
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
