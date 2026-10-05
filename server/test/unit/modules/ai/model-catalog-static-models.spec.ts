import type { ConfigService } from '@nestjs/config';
import type { ProviderDescriptor } from 'src/modules/ai/providers/types.js';

const FAKE_PROVIDER: ProviderDescriptor = {
  id: 'fake-static',
  label: 'Fake Static Gateway',
  apiKeyEnv: 'FAKE_STATIC_API_KEY',
  baseURLEnv: 'FAKE_STATIC_BASE_URL',
  staticModels: ['fake-model-a', 'fake-model-b'],
};

/** Lõi giả lập, tách khỏi mọi lõi thật trong registry — test này chỉ cần MỘT lõi khai `baseURLEnv` + `staticModels`, không quan tâm lõi đó tên gì. */
jest.mock('src/modules/ai/providers/index.js', () => ({
  providerIds: () => ['fake-static'],
  findProvider: (id: string) =>
    id === 'fake-static' ? FAKE_PROVIDER : undefined,
}));

import { ModelCatalogService } from 'src/modules/ai/services/model-catalog.service.js';

/** `GET /models` không hỗ trợ (đo thật: Cloudflare trả 405) — `catalogFor` phải rơi về `staticModels` của descriptor thay vì ném lỗi, như mọi lõi khác khai `baseURLEnv`. */
describe('ModelCatalogService — lõi khai staticModels (GET /models không hỗ trợ)', () => {
  const config = {
    get: (key: string) => {
      const values: Record<string, unknown> = {
        'ai.catalogUrl': 'https://unused.example/api.json',
        'ai.provider': 'fake-static',
        'ai.modelId': 'fake-model-a',
        'ai.apiKeys': { 'fake-static': 'token' },
        'ai.userAgents': {},
        'ai.baseURLs': { 'fake-static': 'https://fake.example/v1' },
      };
      return values[key];
    },
  } as unknown as ConfigService;

  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('listModels trả đúng danh sách staticModels, không ném lỗi', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 405 }) as typeof fetch;

    const service = new ModelCatalogService(config);
    const models = await service.listModels('fake-static');

    expect(models.map((m) => m.id)).toContain('fake-model-a');
  });

  test('resolve() chọn đúng model mặc định qua đường staticModels', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 405 }) as typeof fetch;

    const service = new ModelCatalogService(config);
    const resolved = await service.resolve();

    expect(resolved.model.id).toBe('fake-model-a');
    expect(resolved.baseURL).toBe('https://fake.example/v1');
  });
});
