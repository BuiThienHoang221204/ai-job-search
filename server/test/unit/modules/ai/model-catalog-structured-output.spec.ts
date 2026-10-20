import type { ConfigService } from '@nestjs/config';
import type { ProviderDescriptor } from 'src/modules/ai/providers/types.js';

const SAME_NAME: ProviderDescriptor = {
  id: 'zen',
  label: 'Zen',
  apiKeyEnv: 'ZEN_API_KEY',
  baseURLEnv: 'ZEN_BASE_URL',
};

const RENAMED: ProviderDescriptor = {
  id: 'gem',
  label: 'Gem',
  apiKeyEnv: 'GEM_API_KEY',
  baseURLEnv: 'GEM_BASE_URL',
  catalogId: 'zen',
  catalogModelId: (id) => id.replace(/^models\//, ''),
};

const NOT_IN_CATALOG: ProviderDescriptor = {
  id: 'other',
  label: 'Other',
  apiKeyEnv: 'OTHER_API_KEY',
  baseURLEnv: 'OTHER_BASE_URL',
};

jest.mock('src/modules/ai/providers/index.js', () => ({
  providerIds: () => ['zen', 'gem', 'other'],
  findProvider: (id: string) =>
    [SAME_NAME, RENAMED, NOT_IN_CATALOG].find((p) => p.id === id),
}));

import { ModelCatalogService } from 'src/modules/ai/services/model-catalog.service.js';

const LIVE = ['json-ok', 'no-json', 'unknown-to-catalog'];

const CATALOG = {
  zen: {
    id: 'zen',
    name: 'Zen',
    models: {
      'json-ok': { id: 'json-ok', name: 'a', structured_output: true },
      'no-json': { id: 'no-json', name: 'b' },
    },
  },
};

const config = {
  get: (key: string) =>
    ({
      'ai.catalogUrl': 'https://catalog.example/api.json',
      'ai.provider': 'zen',
      'ai.modelId': 'json-ok',
      'ai.apiKeys': { zen: 'token', gem: 'token', other: 'token' },
      'ai.userAgents': {},
      'ai.baseURLs': {
        zen: 'https://zen.example/v1',
        gem: 'https://gem.example/v1',
        other: 'https://other.example/v1',
      },
    })[key],
} as unknown as ConfigService;

function serve(catalogOk: boolean) {
  global.fetch = jest
    .fn<Promise<unknown>, [string]>()
    .mockImplementation((url) => {
      if (url.startsWith('https://gem.example')) {
        return Promise.resolve({
          ok: true,
          json: () => ({ data: LIVE.map((id) => ({ id: `models/${id}` })) }),
        });
      }
      if (url.endsWith('/models')) {
        return Promise.resolve({
          ok: true,
          json: () => ({ data: LIVE.map((id) => ({ id })) }),
        });
      }
      return Promise.resolve(
        catalogOk
          ? { ok: true, json: () => CATALOG }
          : { ok: false, status: 503 },
      );
    }) as unknown as typeof fetch;
}

describe('ModelCatalogService.discoverModelsFor — lọc theo structured_output của catalog', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('bỏ model catalog ghi mà không khai structured_output, giữ model catalog không biết', async () => {
    serve(true);
    const found = await new ModelCatalogService(config).discoverModelsFor(
      'zen',
    );
    expect(found).toEqual(['zen/json-ok', 'zen/unknown-to-catalog']);
  });

  test('lõi mang tên khác trong catalog tra theo catalogId và catalogModelId', async () => {
    serve(true);
    const found = await new ModelCatalogService(config).discoverModelsFor(
      'gem',
    );
    expect(found).toEqual([
      'gem/models/json-ok',
      'gem/models/unknown-to-catalog',
    ]);
  });

  test('lõi catalog không có thì giữ nguyên', async () => {
    serve(true);
    const found = await new ModelCatalogService(config).discoverModelsFor(
      'other',
    );
    expect(found).toEqual(LIVE.map((id) => `other/${id}`));
  });

  test('catalog ngoài không tải được thì giữ nguyên danh sách', async () => {
    serve(false);
    const found = await new ModelCatalogService(config).discoverModelsFor(
      'zen',
    );
    expect(found).toEqual(LIVE.map((id) => `zen/${id}`));
  });
});
