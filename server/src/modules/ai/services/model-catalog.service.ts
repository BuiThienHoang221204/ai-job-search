import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { formatModelRef, parseModelRef, type ModelRef } from '../model-ref.js';
import {
  findProvider,
  providerIds,
  type ProviderDescriptor,
} from '../providers/index.js';

export type CatalogModel = {
  id: string;
  name: string;
  tool_call?: boolean;
  cost?: { input: number; output: number };
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
  /** Header thêm vào mỗi request. Rỗng với hầu hết lõi — xem `userAgentEnv`. */
  headers: Record<string, string>;
};

const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Adapter mà dự án thật sự cài. OpenRouter khai `@openrouter/ai-sdk-provider`
 * trong catalog nhưng API của nó là OpenAI-compatible, nên nó chạy bằng chính
 * `@ai-sdk/openai-compatible` — không cài thêm package nào.
 */
const SUPPORTED_NPMS = new Set([
  '@ai-sdk/openai-compatible',
  '@openrouter/ai-sdk-provider',
]);

/**
 * Model này không dùng được, hãy thử mắt xích tiếp theo trong chuỗi. Tách khỏi
 * lỗi thường vì nó KHÔNG phải một lần gọi model thất bại — chưa có lần gọi nào
 * cả. `AiService` bắt riêng lớp này để đi tiếp thay vì làm hỏng cả tác vụ.
 */
export class ModelUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelUnavailableError';
  }
}

/** Port từ ai-skill-chat/src/models.ts. */
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

  private get allowPaidModels(): boolean {
    return this.config.get<boolean>('ai.allowPaidModels') ?? false;
  }

  /**
   * Header riêng của một lõi. Hiện chỉ có `User-Agent`, và chỉ `opencode` dùng
   * tới — lý do đầy đủ nằm trong docblock của `providers/opencode.ts`.
   */
  private headersFor(descriptor: ProviderDescriptor): Record<string, string> {
    if (!descriptor.userAgentEnv) return {};
    const agents = this.config.get<Record<string, string>>('ai.userAgents');
    const agent = agents?.[descriptor.id];
    return agent ? { 'User-Agent': agent } : {};
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

  /**
   * Danh sách model gateway ĐANG phục vụ, giữ nguyên phần thân để lõi nào biết
   * đọc capability thì đọc. Catalog không thay được cái này: nó ghi OpenCode có
   * 27 model free trong khi gateway chỉ phục vụ 7.
   */
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

  /** Model miễn phí. Không khai giá thì coi như TRẢ TIỀN — an toàn về tiền. */
  private isFree(model: CatalogModel): boolean {
    return model.cost?.input === 0 && model.cost?.output === 0;
  }

  private usableAdapter(
    model: CatalogModel,
    provider: CatalogProvider,
  ): boolean {
    return SUPPORTED_NPMS.has(
      model.provider?.npm ?? provider.npm ?? '@ai-sdk/openai-compatible',
    );
  }

  /**
   * Chọn model để chạy. `ref` có thể là `lõi/model` hoặc chỉ `model` (dùng lõi
   * mặc định). `requireToolCall` dành cho các skill cần gọi tool.
   *
   * KHÔNG bao giờ tự thay thế bằng model khác. Bản cũ có: không tìm thấy model
   * được yêu cầu thì nó lấy `models[0]`. Với OpenCode toàn model free thì vô
   * hại, nhưng OpenRouter có 351 model gồm cả loại trả tiền đắt — gõ sai một ký
   * tự trong `.env` sẽ thành một hoá đơn chạy theo cron.
   */
  async resolve(ref?: string, requireToolCall = false): Promise<ResolvedModel> {
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
    const catalog = await this.loadCatalog();
    const provider = catalog[descriptor.id];
    if (!provider) {
      throw new ModelUnavailableError(
        `Catalog không có lõi ${descriptor.label} (${descriptor.id}).`,
      );
    }

    const selected = this.select(provider, descriptor, target, requireToolCall);
    const baseURL = selected.provider?.api ?? provider.api;
    if (!baseURL) {
      throw new ModelUnavailableError(
        `Model ${formatModelRef(target)} không công bố API URL.`,
      );
    }

    await this.assertServed(descriptor, selected, baseURL, apiKey, headers);

    return {
      providerId: provider.id,
      model: selected,
      baseURL,
      apiKey,
      headers,
    };
  }

  /** Tìm đúng model được yêu cầu, và nói rõ vì sao khi không dùng được. */
  private select(
    provider: CatalogProvider,
    descriptor: ProviderDescriptor,
    target: ModelRef,
    requireToolCall: boolean,
  ): CatalogModel {
    const all = Object.values(provider.models);
    const found = all.find((model) => model.id === target.modelId);
    if (!found) {
      throw new ModelUnavailableError(
        `Lõi ${descriptor.label} không có model "${target.modelId}".`,
      );
    }
    if (!this.usableAdapter(found, provider)) {
      throw new ModelUnavailableError(
        `Model ${formatModelRef(target)} cần adapter ${found.provider?.npm ?? provider.npm}, dự án không cài.`,
      );
    }
    if (requireToolCall && found.tool_call === false) {
      throw new ModelUnavailableError(
        `Model ${formatModelRef(target)} không gọi được tool.`,
      );
    }
    if (!this.allowPaidModels && !this.isFree(found)) {
      throw new ModelUnavailableError(
        `Model ${formatModelRef(target)} là model TRẢ TIỀN và AI_ALLOW_PAID_MODELS đang tắt.`,
      );
    }
    if (descriptor.knownNoStructuredOutput?.includes(found.id)) {
      throw new ModelUnavailableError(
        `Model ${formatModelRef(target)} đã ĐO là không giữ được structured output.`,
      );
    }
    return found;
  }

  /**
   * Gateway có đang phục vụ model này không, và nếu nó khai capability thì model
   * này có làm được structured output không. Hỏi được thì tin, không hỏi được
   * thì bỏ qua — mất `/models` không đáng làm đổ cả tác vụ.
   */
  private async assertServed(
    descriptor: ProviderDescriptor,
    model: CatalogModel,
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

    const entry = live.get(model.id);
    if (!entry) {
      throw new ModelUnavailableError(
        `Lõi ${descriptor.label} hiện không phục vụ model "${model.id}".`,
      );
    }
    if (descriptor.declaresStructuredOutput?.(entry) === false) {
      throw new ModelUnavailableError(
        `Lõi ${descriptor.label} khai model "${model.id}" không hỗ trợ structured output.`,
      );
    }
  }

  /** Model dùng được của một lõi, đã áp đúng bộ lọc mà `resolve()` áp. */
  async listModels(providerId?: string): Promise<
    Array<{
      id: string;
      ref: string;
      name: string;
      free: boolean;
      toolCall: boolean;
      structuredOutput: boolean | null;
    }>
  > {
    const id = providerId ?? this.defaultProviderId;
    const descriptor = findProvider(id);
    if (!descriptor) throw new Error(`Không biết lõi model: ${id}`);

    const catalog = await this.loadCatalog();
    const provider = catalog[id];
    if (!provider) throw new Error(`Catalog không có lõi: ${id}`);

    const models = Object.values(provider.models).filter((model) =>
      this.usableAdapter(model, provider),
    );

    let live: Map<string, Record<string, unknown>> | undefined;
    try {
      const baseURL = provider.api;
      if (baseURL) {
        live = await this.liveModels(baseURL, this.apiKeyFor(descriptor));
      }
    } catch {
      live = undefined;
    }

    const served = live?.size ? models.filter((m) => live.has(m.id)) : models;

    return served
      .map((model) => {
        const entry = live?.get(model.id);
        const declared =
          entry && descriptor.declaresStructuredOutput
            ? descriptor.declaresStructuredOutput(entry)
            : null;
        return {
          id: model.id,
          ref: formatModelRef({ providerId: id, modelId: model.id }),
          name: model.name,
          free: this.isFree(model),
          toolCall: model.tool_call !== false,
          structuredOutput: descriptor.knownNoStructuredOutput?.includes(
            model.id,
          )
            ? false
            : declared,
        };
      })
      .sort(
        (a, b) =>
          Number(b.id === this.defaultModelId) -
            Number(a.id === this.defaultModelId) ||
          Number(b.free) - Number(a.free) ||
          a.name.localeCompare(b.name),
      );
  }
}
