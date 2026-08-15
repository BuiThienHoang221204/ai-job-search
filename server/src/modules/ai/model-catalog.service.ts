import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const SUPPORTED_NPM = '@ai-sdk/openai-compatible';

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
    { ids: Set<string>; expiresAt: number }
  >();

  constructor(private readonly config: ConfigService) {}

  private get catalogUrl(): string {
    return this.config.get<string>('ai.catalogUrl')!;
  }

  private get providerId(): string {
    return this.config.get<string>('ai.provider')!;
  }

  private get apiKey(): string {
    return this.config.get<string>('ai.apiKey')!;
  }

  private get defaultModelId(): string {
    return this.config.get<string>('ai.modelId')!;
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

  private async liveModelIds(
    baseURL: string,
  ): Promise<Set<string> | undefined> {
    const url = `${baseURL.replace(/\/$/, '')}/models`;
    const cached = this.liveModelCache.get(url);
    if (cached && cached.expiresAt > Date.now()) return cached.ids;

    const response = await fetch(url, {
      headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {},
    });
    if (!response.ok) return undefined;

    const body = (await response.json()) as { data?: Array<{ id?: string }> };
    const ids = new Set(
      body.data?.flatMap((item) =>
        typeof item.id === 'string' ? [item.id] : [],
      ) ?? [],
    );
    this.liveModelCache.set(url, { ids, expiresAt: Date.now() + CACHE_TTL_MS });
    return ids;
  }

  /**
   * Chọn model để chạy. `requireToolCall` dành cho các skill cần gọi tool;
   * chấm điểm fit chỉ cần structured output nên không bắt buộc.
   */
  async resolve(
    requestedModelId?: string,
    requireToolCall = false,
  ): Promise<ResolvedModel> {
    const catalog = await this.loadCatalog();
    const provider = catalog[this.providerId];
    if (!provider)
      throw new Error(`Không tìm thấy provider: ${this.providerId}`);

    let models = Object.values(provider.models).filter(
      (model) =>
        (model.provider?.npm ?? provider.npm ?? SUPPORTED_NPM) ===
        SUPPORTED_NPM,
    );
    if (requireToolCall)
      models = models.filter((model) => model.tool_call !== false);
    if (!models.length)
      throw new Error(`Provider ${this.providerId} không có model dùng được`);

    const wantedId = requestedModelId ?? this.defaultModelId;
    const discoveryBaseURL =
      models.find((model) => model.id === wantedId)?.provider?.api ??
      provider.api;

    if (discoveryBaseURL) {
      try {
        const liveIds = await this.liveModelIds(discoveryBaseURL);
        const live = liveIds
          ? models.filter((model) => liveIds.has(model.id))
          : [];
        if (live.length) models = live;
      } catch {
        // Catalog vẫn dùng được khi không hỏi được /models.
      }
    }

    const selected =
      models.find((model) => model.id === wantedId) ??
      models.find((model) => model.cost?.input === 0) ??
      models[0];
    if (!selected) throw new Error(`Model không có sẵn: ${wantedId}`);

    const baseURL = selected.provider?.api ?? provider.api;
    if (!baseURL) throw new Error(`Model ${selected.id} không công bố API URL`);

    if (selected.id !== wantedId) {
      this.logger.warn(
        `Model ${wantedId} không có sẵn, dùng ${selected.id} thay thế`,
      );
    }

    return {
      providerId: provider.id,
      model: selected,
      baseURL,
      apiKey: this.apiKey,
    };
  }

  async listModels(): Promise<
    Array<{ id: string; name: string; free: boolean; toolCall: boolean }>
  > {
    const catalog = await this.loadCatalog();
    const provider = catalog[this.providerId];
    if (!provider)
      throw new Error(`Không tìm thấy provider: ${this.providerId}`);

    let models = Object.values(provider.models).filter(
      (model) =>
        (model.provider?.npm ?? provider.npm ?? SUPPORTED_NPM) ===
        SUPPORTED_NPM,
    );

    const discoveryBaseURL =
      models.find((model) => model.id === this.defaultModelId)?.provider?.api ??
      provider.api;
    if (discoveryBaseURL) {
      try {
        const ids = await this.liveModelIds(discoveryBaseURL);
        const live = ids ? models.filter((model) => ids.has(model.id)) : [];
        if (live.length) models = live;
      } catch {
        // Bỏ qua, dùng kết quả từ catalog.
      }
    }

    return models
      .sort(
        (a, b) =>
          Number(b.id === this.defaultModelId) -
            Number(a.id === this.defaultModelId) ||
          Number(b.cost?.input === 0) - Number(a.cost?.input === 0) ||
          a.name.localeCompare(b.name),
      )
      .map((model) => ({
        id: model.id,
        name: model.name,
        free: model.cost?.input === 0,
        toolCall: model.tool_call !== false,
      }));
  }
}
