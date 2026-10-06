import { formatModelRef } from './model-ref';
import { ModelUnavailableError } from './failure-kind';
import type { ModelRef } from './model-ref';
import type { ProviderDescriptor } from '../providers/index';
import type { CatalogModel, CatalogProvider, ModelListing } from '../ai.types';

const SUPPORTED_NPMS = new Set([
  '@ai-sdk/openai-compatible',
  '@openrouter/ai-sdk-provider',
]);

export function usableAdapter(
  model: CatalogModel,
  provider: CatalogProvider,
): boolean {
  return SUPPORTED_NPMS.has(
    model.provider?.npm ?? provider.npm ?? '@ai-sdk/openai-compatible',
  );
}
const SERVED_HINT_LIMIT = 10;

export function servedHint(provider: CatalogProvider): string {
  const ids = Object.keys(provider.models);
  const shown = ids.slice(0, SERVED_HINT_LIMIT).join(', ');
  const more = ids.length > SERVED_HINT_LIMIT ? ', …' : '';
  return `(đang phục vụ ${ids.length} model: ${shown}${more})`;
}

export function streamsJsonFor(
  descriptor: ProviderDescriptor,
  modelId: string,
): boolean {
  const allowed = descriptor.streamsJson;
  return allowed === 'all' || allowed?.includes(modelId) === true;
}

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
      `Lõi ${descriptor.label} không có model "${target.modelId}" ${servedHint(provider)}.`,
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
