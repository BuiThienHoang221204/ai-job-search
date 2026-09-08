import { NotFoundException } from '@nestjs/common';
import { AgentService } from 'src/modules/agent/services/agent.service.js';
import type { PrismaService } from 'src/prisma/prisma.service.js';
import type { CommandRegistryService } from 'src/modules/agent/services/command-registry.service.js';
import type { Storage } from 'src/modules/storage/storage.interface.js';

const OWN_KEY = 'nguoi-a/agent_runs/run-1/cv/main.tex';

const build = (options: { run?: unknown } = {}) => {
  const findFirst = jest.fn<Promise<unknown>, [unknown]>(() =>
    Promise.resolve(
      'run' in options
        ? options.run
        : {
            result: {
              artifacts: [{ name: 'cv/main.tex', key: OWN_KEY, bytes: 12_000 }],
            },
          },
    ),
  );

  const readText = jest.fn<Promise<string>, [string]>(() =>
    Promise.resolve('documentclass moderncv'),
  );

  const service = new AgentService(
    { agentRun: { findFirst } } as unknown as PrismaService,
    {} as CommandRegistryService,
    { readText } as unknown as Storage,
  );

  return { service, findFirst, readText };
};

describe('AgentService.artifact', () => {
  it('trả nội dung file và đọc theo khoá đã lưu trong bản ghi', async () => {
    const { service, readText } = build();

    const file = await service.artifact('nguoi-a', 'run-1', 'cv/main.tex');

    expect(file).toEqual({
      name: 'cv/main.tex',
      content: 'documentclass moderncv',
    });
    expect(readText).toHaveBeenCalledWith(OWN_KEY);
  });

  it('khoá lượt chạy theo userId ngay ở truy vấn', async () => {
    const { service, findFirst } = build();

    await service.artifact('nguoi-a', 'run-1', 'cv/main.tex');

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'run-1', userId: 'nguoi-a' },
      }),
    );
  });

  it('lượt chạy của người khác thì báo không tìm thấy', async () => {
    const { service, readText } = build({ run: null });

    await expect(
      service.artifact('nguoi-b', 'run-1', 'cv/main.tex'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(readText).not.toHaveBeenCalled();
  });

  it('tên file không có trong lượt chạy thì KHÔNG đụng tới Storage', async () => {
    const { service, readText } = build();

    await expect(
      service.artifact('nguoi-a', 'run-1', '../../nguoi-b/cv/main.tex'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(readText).not.toHaveBeenCalled();
  });

  it('lượt chạy chưa ghi file nào thì báo không tìm thấy', async () => {
    const { service } = build({ run: { result: null } });

    await expect(
      service.artifact('nguoi-a', 'run-1', 'cv/main.tex'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
