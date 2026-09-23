import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parseModelRef, formatModelRef } from '../utils/model-ref.js';
import { ModelUnavailableError } from '../utils/failure-kind.js';
import { selectModel, toListing, usableAdapter } from '../utils/catalog.js';
import {
  findProvider,
  providerIds,
  type ProviderDescriptor,
} from '../providers/index.js';
import type {
  CatalogProvider,
  ModelListing,
  ResolvedModel,
} from '../ai.types.js';

const CACHE_TTL_MS = 5 * 60 * 1000;

/** Nơi DUY NHẤT đi hỏi model catalog và gateway. Mọi phép lọc, chọn, xếp thứ tự nằm ở `utils/catalog.ts`. */
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

  /** Header riêng của một lõi. Hiện chỉ có `User-Agent`, và chỉ `opencode` dùng tới. */
  private headersFor(descriptor: ProviderDescriptor): Record<string, string> {
    const headers = { ...(descriptor.extraHeaders ?? {}) };
    if (!descriptor.userAgentEnv) return headers;
    const agents = this.config.get<Record<string, string>>('ai.userAgents');
    const agent = agents?.[descriptor.id];
    if (agent) headers['User-Agent'] = agent;
    return headers;
  }

  /** Key của một lõi. Thiếu key là lỗi cấu hình, không phải lỗi lúc chạy. */
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

  /** Lõi nào khai `baseURLEnv` thì bỏ qua catalog ngoài và tự dựng danh sách từ chính `/models` của nó. */
  private baseURLFor(descriptor: ProviderDescriptor): string | undefined {
    if (!descriptor.baseURLEnv) return undefined;
    const urls = this.config.get<Record<string, string>>('ai.baseURLs') ?? {};
    return urls[descriptor.id] || undefined;
  }

  /** Danh sách model của một lõi: từ catalog ngoài, hoặc từ chính gateway khi lõi khai `baseURLEnv`. */
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
      throw new ModelUnavailableError(
        `Không hỏi được ${declared}/models của lõi ${descriptor.label}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    if (!live?.size) {
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

  /** Catalog dùng chung cho mọi lõi, cache 5 phút. */
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

  /** Model gateway ĐANG phục vụ, giữ nguyên phần thân để lõi nào biết đọc capability thì đọc. Catalog ghi OpenCode có 27 model free trong khi gateway chỉ phục vụ 7. */
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

  /** KHÔNG bao giờ tự thay model khác: bản cũ lấy `models[0]` khi không tìm thấy, mà OpenRouter có 351 model gồm loại trả tiền — gõ sai một ký tự trong `.env` thành hoá đơn chạy theo cron. */
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
    };
  }

  /** Không hỏi được `/models` thì BỎ QUA chứ không ném — mất một lượt kiểm không đáng làm đổ cả tác vụ. */
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

  /** Model dùng được của một lõi, đã áp đúng bộ lọc mà `resolve()` áp. */
  async listModels(providerId?: string): Promise<ModelListing[]> {
    const id = providerId ?? this.defaultProviderId;
    const descriptor = findProvider(id);
    if (!descriptor) throw new Error(`Không biết lõi model: ${id}`);

    const apiKey = this.apiKeyFor(descriptor);
    const provider = await this.catalogFor(
      descriptor,
      apiKey,
      this.headersFor(descriptor),
    );

    const models = Object.values(provider.models).filter((model) =>
      usableAdapter(model, provider),
    );

    let live: Map<string, Record<string, unknown>> | undefined;
    try {
      if (provider.api) live = await this.liveModels(provider.api, apiKey);
    } catch {
      live = undefined;
    }

    const served = live?.size ? models.filter((m) => live.has(m.id)) : models;
    return toListing(served, descriptor, live, this.defaultModelId);
  }
}
