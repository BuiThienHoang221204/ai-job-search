import type { ConfigService } from '@nestjs/config';
import type { ProviderDescriptor } from 'src/modules/ai/providers/types.js';

const GATEWAY_PROVIDER: ProviderDescriptor = {
  id: 'fake-gateway',
  label: 'Fake Gateway',
  apiKeyEnv: 'FAKE_GATEWAY_API_KEY',
  baseURLEnv: 'FAKE_GATEWAY_BASE_URL',
};

const CATALOG_PROVIDER: ProviderDescriptor = {
  id: 'fake-catalog',
  label: 'Fake Catalog Provider',
  apiKeyEnv: 'FAKE_CATALOG_API_KEY',
};

jest.mock('src/modules/ai/providers/index.js', () => ({
  providerIds: () => ['fake-gateway', 'fake-catalog'],
  findProvider: (id: string) =>
    [GATEWAY_PROVIDER, CATALOG_PROVIDER].find((p) => p.id === id),
}));

import { ModelCatalogService } from 'src/modules/ai/services/model-catalog.service.js';

function timeoutError(): Error {
  return new DOMException(
    'The operation was aborted due to timeout',
    'TimeoutError',
  );
}

describe('ModelCatalogService — fetch có hạn chờ', () => {
  const config = {
    get: (key: string) => {
      const values: Record<string, unknown> = {
        'ai.catalogUrl': 'https://catalog.example/api.json',
        'ai.provider': 'fake-gateway',
        'ai.modelId': 'fake-model-a',
        'ai.apiKeys': { 'fake-gateway': 'token', 'fake-catalog': 'token' },
        'ai.userAgents': {},
        'ai.baseURLs': { 'fake-gateway': 'https://fake.example/v1' },
      };
      return values[key];
    },
  } as unknown as ConfigService;

  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('cả hai lời gọi fetch đều mang AbortSignal', async () => {
    const fetchMock = jest
      .fn<Promise<unknown>, [string, RequestInit | undefined]>()
      .mockImplementation((url) =>
        Promise.resolve(
          url.endsWith('/models')
            ? { ok: true, json: () => ({ data: [{ id: 'fake-model-a' }] }) }
            : { ok: false, status: 405 },
        ),
      );
    global.fetch = fetchMock as unknown as typeof fetch;

    const service = new ModelCatalogService(config);
    await service.resolve();
    await expect(service.loadCatalog()).rejects.toThrow('405');

    const urls = fetchMock.mock.calls.map(([url]) => url);
    expect(urls).toContain('https://fake.example/v1/models');
    expect(urls).toContain('https://catalog.example/api.json');
    for (const [, init] of fetchMock.mock.calls) {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(init?.signal?.aborted).toBe(false);
    }
  });

  test('/models hết giờ thì ném lỗi như khi fetch hỏng, không treo', async () => {
    global.fetch = jest.fn().mockRejectedValue(timeoutError());

    const service = new ModelCatalogService(config);

    await expect(service.resolve()).rejects.toThrow('timeout');
  });

  test('catalog hết giờ thì ném lỗi như khi fetch hỏng, không treo', async () => {
    global.fetch = jest.fn().mockRejectedValue(timeoutError());

    const service = new ModelCatalogService(config);

    await expect(service.resolve('fake-catalog/some-model')).rejects.toThrow(
      'timeout',
    );
  });
});
