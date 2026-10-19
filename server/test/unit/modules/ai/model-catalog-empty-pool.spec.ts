import type { ConfigService } from '@nestjs/config';
import { ModelUnavailableError } from 'src/common/ai/failure-kind.js';
import { ModelCatalogService } from 'src/modules/ai/services/model-catalog.service.js';

describe('ModelCatalogService — không có model mặc định', () => {
  test('gọi không chỉ định model khi bể trống thì báo lỗi rõ, không đoán model', async () => {
    const config = {
      get: (key: string) => (key === 'ai.provider' ? 'opencode' : ''),
    } as unknown as ConfigService;

    const resolving = new ModelCatalogService(config).resolve();

    await expect(resolving).rejects.toBeInstanceOf(ModelUnavailableError);
    await expect(resolving).rejects.toThrow('Bể model đang trống');
  });
});
