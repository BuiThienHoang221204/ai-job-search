import { formatModelRef } from './model-ref.js';
import { ModelUnavailableError } from './failure-kind.js';
import type { ModelRef } from './model-ref.js';
import type { ProviderDescriptor } from '../providers/index.js';
import type {
  CatalogModel,
  CatalogProvider,
  ModelListing,
} from '../ai.types.js';

/** Adapter dự án THẬT SỰ cài. OpenRouter khai SDK riêng trong catalog nhưng API của nó là OpenAI-compatible nên chạy bằng adapter chung. */
const SUPPORTED_NPMS = new Set([
  '@ai-sdk/openai-compatible',
  '@openrouter/ai-sdk-provider',
]);

/** Model khai adapter nào thì thắng; không khai thì theo lõi; lõi cũng không khai thì mặc định openai-compatible. */
export function usableAdapter(
  model: CatalogModel,
  provider: CatalogProvider,
): boolean {
  return SUPPORTED_NPMS.has(
    model.provider?.npm ?? provider.npm ?? '@ai-sdk/openai-compatible',
  );
}

/** Tìm đúng model được yêu cầu, và nói rõ VÌ SAO khi không dùng được — ba lý do khác nhau, ba câu khác nhau. */
export function selectModel(
  provider: CatalogProvider,
  descriptor: ProviderDescriptor,
  target: ModelRef,
): CatalogModel {
  const found = Object.values(provider.models).find(
    (model) => model.id === target.modelId,
  );
  if (!found) {
    throw new ModelUnavailableError(
      `Lõi ${descriptor.label} không có model "${target.modelId}".`,
    );
  }
  if (!usableAdapter(found, provider)) {
    throw new ModelUnavailableError(
      `Model ${formatModelRef(target)} cần adapter ${found.provider?.npm ?? provider.npm}, dự án không cài.`,
    );
  }
  if (descriptor.knownNoStructuredOutput?.includes(found.id)) {
    throw new ModelUnavailableError(
      `Model ${formatModelRef(target)} đã ĐO là không giữ được structured output.`,
    );
  }
  return found;
}

/** Danh sách cho màn quản trị: model mặc định lên đầu, còn lại theo tên. Lời khai của gateway thua danh sách ĐÃ ĐO. */
export function toListing(
  models: CatalogModel[],
  descriptor: ProviderDescriptor,
  live: Map<string, Record<string, unknown>> | undefined,
  defaultModelId: string,
): ModelListing[] {
  return models
    .map((model) => {
      const entry = live?.get(model.id);
      const declared =
        entry && descriptor.declaresStructuredOutput
          ? descriptor.declaresStructuredOutput(entry)
          : null;
      return {
        id: model.id,
        ref: formatModelRef({ providerId: descriptor.id, modelId: model.id }),
        name: model.name,
        toolCall: model.tool_call !== false,
        structuredOutput: descriptor.knownNoStructuredOutput?.includes(model.id)
          ? false
          : declared,
      };
    })
    .sort(
      (a, b) =>
        Number(b.id === defaultModelId) - Number(a.id === defaultModelId) ||
        a.name.localeCompare(b.name),
    );
}
