import type { Logger } from '@nestjs/common';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import { formatModelRef } from '../utils/model-ref';
import { extractJsonFromResponse } from '../utils/json-text';
import { extractJsonFromStream } from '../utils/json-stream';
import type { ModelCatalogService } from './model-catalog.service';

export type ResolvedLanguageModel = {
  model: LanguageModel;
  id: string;
  provider: string;
  ref: string;
  defaultMaxOutputTokens?: number;
};

export class LanguageModelFactory {
  constructor(
    private readonly catalog: ModelCatalogService,
    private readonly logger: Logger,
  ) {}

  async structuredOutputModeFor(
    modelId: string | undefined,
    fallbackDefault: boolean,
  ): Promise<{
    providerId: string;
    structuredOutputs: boolean;
    honorsResponseFormat: boolean;
    canStream: boolean;
  }> {
    const resolved = await this.catalog.resolve(modelId);
    const honorsResponseFormat = resolved.honorsResponseFormat !== false;
    return {
      providerId: resolved.providerId,
      structuredOutputs: honorsResponseFormat && fallbackDefault,
      honorsResponseFormat,
      canStream: honorsResponseFormat || resolved.streamsJson === true,
    };
  }

  async create(
    modelId: string | undefined,
    structuredOutputs: boolean,
    jsonStream = false,
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
      const unwrapped = await extractJsonFromResponse(response);
      return jsonStream ? extractJsonFromStream(unwrapped) : unwrapped;
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
      defaultMaxOutputTokens: resolved.defaultMaxOutputTokens,
    };
  }
}
