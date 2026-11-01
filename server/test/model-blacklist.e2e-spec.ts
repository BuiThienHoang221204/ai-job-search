import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ModelBlacklistService } from 'src/modules/ai/services/model-blacklist.service.js';
import { createTestApp, type TestApp } from './support/app-harness.js';

const rows = (provider: string, modelId: string, n: number, ok: boolean) =>
  Array.from({ length: n }, () => ({
    purpose: 'model.probe',
    provider,
    modelId,
    ok,
    durationMs: 100,
  }));

describe('Blacklist model tự sinh (regenerate)', () => {
  let app: TestApp;
  let svc: ModelBlacklistService;
  const file = join(tmpdir(), `bl-e2e-${Date.now()}.json`);

  beforeAll(async () => {
    process.env.MODEL_BLACKLIST_FILE = file;
    app = await createTestApp();
    svc = app.app.get(ModelBlacklistService, { strict: false });
  });
  beforeEach(async () => {
    await app.reset();
  });
  afterAll(async () => {
    delete process.env.MODEL_BLACKLIST_FILE;
    rmSync(file, { force: true });
    await app.close();
  });

  it('chặn model >5 lượt & 0% thành công; chừa model còn sống và model ít lượt', async () => {
    await app.prisma.aiCall.createMany({
      data: [
        ...rows('omniroute', 'cfp/dead', 6, false),
        ...rows('omniroute', 'cfp/alive', 6, true),
        ...rows('omniroute', 'cfp/few', 3, false),
      ],
    });

    await svc.regenerate();

    expect(svc.blocks('omniroute/cfp/dead')).toBe(true);
    expect(svc.blocks('omniroute/cfp/alive')).toBe(false);
    expect(svc.blocks('omniroute/cfp/few')).toBe(false);
  });

  it('cùng model chết ở lõi này KHÔNG chặn lõi khác', async () => {
    await app.prisma.aiCall.createMany({
      data: [
        ...rows('unorouter', 'glm-4:free', 8, false),
        ...rows('omniroute', 'glm-4:free', 8, true),
      ],
    });

    await svc.regenerate();

    expect(svc.blocks('unorouter/glm-4:free')).toBe(true);
    expect(svc.blocks('omniroute/glm-4:free')).toBe(false);
  });
});
