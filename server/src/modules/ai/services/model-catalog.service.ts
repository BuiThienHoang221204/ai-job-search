import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parseModelRef, formatModelRef } from '../utils/model-ref';
import { ModelUnavailableError } from '../utils/failure-kind';
import {
  selectModel,
  streamsJsonFor,
  toListing,
  usableAdapter,
} from '../utils/catalog';
import {
  findProvider,
  providerIds,
  type ProviderDescriptor,
} from '../providers/index';
import type { CatalogProvider, ModelListing, ResolvedModel } from '../ai.types';
import { messageOf } from '@/common/error-message';

const CACHE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class ModelCatalogService {
  private readonly logger = new Logger(ModelCatalogService.name);

  private catalogCache?: {
    value: Record<string, CatalogProvider>;
    expiresAt: number;
  };
  private readonly liveModelCache = new Map<
    string,
    { entries: Map<string, Record<string, unknown>>; expiresAt: number }
  >();

  constructor(private readonly config: ConfigService) {}

  private get catalogUrl(): string {
    return this.config.get<string>('ai.catalogUrl')!;
  }

  private get defaultProviderId(): string {
    return this.config.get<string>('ai.provider')!;
  }

  private get defaultModelId(): string {
    return this.config.get<string>('ai.modelId')!;
  }

  private headersFor(descriptor: ProviderDescriptor): Record<string, string> {
    const headers = { ...(descriptor.extraHeaders ?? {}) };
    if (!descriptor.userAgentEnv) return headers;
    const agents = this.config.get<Record<string, string>>('ai.userAgents');
    const agent = agents?.[descriptor.id];
    if (agent) headers['User-Agent'] = agent;
    return headers;
  }

  private apiKeyFor(descriptor: ProviderDescriptor): string {
    const keys = this.config.get<Record<string, string>>('ai.apiKeys') ?? {};
    const key = keys[descriptor.id];
    if (!key) {
      throw new ModelUnavailableError(
        `Lõi ${descriptor.label} chưa có API key. Đặt ${descriptor.apiKeyEnv} trong .env.`,
      );
    }
    return key;
  }

  private baseURLFor(descriptor: ProviderDescriptor): string | undefined {
    if (!descriptor.baseURLEnv) return undefined;
    const urls = this.config.get<Record<string, string>>('ai.baseURLs') ?? {};
    return urls[descriptor.id] || undefined;
  }

  /** Model của một lõi: từ catalog ngoài, hoặc từ chính `/models` khi lõi khai `baseURLEnv`. */
  private async catalogFor(
    descriptor: ProviderDescriptor,
    apiKey: string,
    headers: Record<string, string>,
  ): Promise<CatalogProvider> {
    const declared = this.baseURLFor(descriptor);
    if (!declared) {
      const catalog = await this.loadCatalog();
      const provider = catalog[descriptor.id];
      if (!provider) {
        throw new ModelUnavailableError(
          `Catalog không có lõi ${descriptor.label} (${descriptor.id}).`,
        );
      }
      return provider;
    }

    let live: Map<string, Record<string, unknown>> | undefined;
    try {
      live = await this.liveModels(declared, apiKey, headers);
    } catch (error) {
      if (!descriptor.staticModels?.length) {
        throw new ModelUnavailableError(
          `Không hỏi được ${declared}/models của lõi ${descriptor.label}: ${messageOf(
            error,
          )}`,
        );
      }
    }
    if (!live?.size) {
      if (descriptor.staticModels?.length) {
        const models: CatalogProvider['models'] = {};
        for (const id of descriptor.staticModels) models[id] = { id, name: id };
        return {
          id: descriptor.id,
          name: descriptor.label,
          api: declared,
          models,
        };
      }
      throw new ModelUnavailableError(
        `Lõi ${descriptor.label} tại ${declared} không trả model nào.`,
      );
    }

    const models: CatalogProvider['models'] = {};
    for (const [id, entry] of live) {
      models[id] = {
        id,
        name: typeof entry.name === 'string' ? entry.name : id,
      };
    }
    return { id: descriptor.id, name: descriptor.label, api: declared, models };
  }

  async loadCatalog(): Promise<Record<string, CatalogProvider>> {
    if (this.catalogCache && this.catalogCache.expiresAt > Date.now()) {
      return this.catalogCache.value;
    }

    this.logger.log(`Tải model catalog: ${this.catalogUrl}`);
    const response = await fetch(this.catalogUrl, {
      headers: { 'User-Agent': 'ai-job-search' },
    });
    if (!response.ok) {
      throw new Error(`Không thể tải model catalog (${response.status})`);
    }

    const value = (await response.json()) as Record<string, CatalogProvider>;
    this.catalogCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    this.logger.log(
      `Catalog: ${Object.keys(value).length} provider, cache 5 phút`,
    );
    return value;
  }

  /** Model gateway ĐANG phục vụ — catalog thường khai nhiều hơn số gateway thật sự phục vụ. */
  private async liveModels(
    baseURL: string,
    apiKey: string,
    headers: Record<string, string> = {},
  ): Promise<Map<string, Record<string, unknown>> | undefined> {
    const url = `${baseURL.replace(/\/$/, '')}/models`;
    const cached = this.liveModelCache.get(url);
    if (cached && cached.expiresAt > Date.now()) return cached.entries;

    const response = await fetch(url, {
      headers: {
        ...headers,
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
    });
    if (!response.ok) return undefined;

    const body = (await response.json()) as {
      data?: Array<Record<string, unknown>>;
    };
    const entries = new Map<string, Record<string, unknown>>();
    for (const item of body.data ?? []) {
      if (typeof item.id === 'string') entries.set(item.id, item);
    }

    this.liveModelCache.set(url, {
      entries,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    return entries;
  }

  /** KHÔNG bao giờ tự thay model khác khi không tìm thấy: gõ sai `.env` không được thành hoá đơn. */
  async resolve(ref?: string): Promise<ResolvedModel> {
    const target = parseModelRef(
      ref ?? this.defaultModelId,
      providerIds(),
      this.defaultProviderId,
    );
    const descriptor = findProvider(target.providerId);
    if (!descriptor) {
      throw new ModelUnavailableError(
        `Không biết lõi model "${target.providerId}". Các lõi đã khai: ${providerIds().join(', ')}.`,
      );
    }

    const apiKey = this.apiKeyFor(descriptor);
    const headers = this.headersFor(descriptor);
    const provider = await this.catalogFor(descriptor, apiKey, headers);

    const selected = selectModel(provider, descriptor, target);
    const baseURL = selected.provider?.api ?? provider.api;
    if (!baseURL) {
      throw new ModelUnavailableError(
        `Model ${formatModelRef(target)} không công bố API URL.`,
      );
    }

    await this.assertServed(descriptor, selected.id, baseURL, apiKey, headers);

    return {
      providerId: provider.id,
      model: selected,
      baseURL,
      apiKey,
      headers,
      explicitStreamFlag: descriptor.explicitStreamFlag === true,
      honorsResponseFormat: descriptor.honorsResponseFormat !== false,
      streamsJson: streamsJsonFor(descriptor, selected.id),
      defaultMaxOutputTokens: descriptor.defaultMaxOutputTokens,
    };
  }

  private async assertServed(
    descriptor: ProviderDescriptor,
    modelId: string,
    baseURL: string,
    apiKey: string,
    headers: Record<string, string> = {},
  ): Promise<void> {
    let live: Map<string, Record<string, unknown>> | undefined;
    try {
      live = await this.liveModels(baseURL, apiKey, headers);
    } catch {
      return;
    }
    if (!live?.size) return;

    const entry = live.get(modelId);
    if (!entry) {
      throw new ModelUnavailableError(
        `Lõi ${descriptor.label} hiện không phục vụ model "${modelId}".`,
      );
    }
    if (descriptor.declaresStructuredOutput?.(entry) === false) {
      throw new ModelUnavailableError(
        `Lõi ${descriptor.label} khai model "${modelId}" không hỗ trợ structured output.`,
      );
    }
  }

  async listModels(providerId?: string): Promise<ModelListing[]> {
    const id = providerId ?? this.defaultProviderId;
    const descriptor = findProvider(id);
    if (!descriptor) throw new Error(`Không biết lõi model: ${id}`);

    const apiKey = this.apiKeyFor(descriptor);
    const headers = this.headersFor(descriptor);
    const provider = await this.catalogFor(descriptor, apiKey, headers);

    const models = Object.values(provider.models).filter((model) =>
      usableAdapter(model, provider),
    );

    let live: Map<string, Record<string, unknown>> | undefined;
    try {
      if (provider.api)
        live = await this.liveModels(provider.api, apiKey, headers);
    } catch {
      live = undefined;
    }

    const served = live?.size ? models.filter((m) => live.has(m.id)) : models;
    return toListing(served, descriptor, live, this.defaultModelId);
  }
}
