import type { ConfigService } from '@nestjs/config';

type ExecCallback = (error: Error | null, result?: unknown) => void;

const execFile = jest.fn<void, [string, string[], unknown, ExecCallback]>();

jest.mock('node:child_process', () => ({
  execFile: (...args: [string, string[], unknown, ExecCallback]) =>
    execFile(...args),
}));

import {
  BLOCKED_COOLDOWN_MS,
  PortalCliService,
} from 'src/modules/scraper/services/portal-cli.service.js';

const config = {
  get: (key: string) =>
    ({
      'scraper.portalsDir': '/khong-ton-tai',
      'scraper.timeoutMs': 60_000,
      'scraper.portalDelayMs': 0,
    })[key],
} as unknown as ConfigService;

type Internals = {
  portals: Map<string, unknown>;
  lastDoneAt: Map<string, number>;
};

/** Dựng service có sẵn một portal, bỏ qua bước quét thư mục. */
function serviceWith(portal: string): PortalCliService {
  const service = new PortalCliService(config);
  (service as unknown as Internals).portals.set(portal, {
    key: portal,
    cliPath: `.agents/skills/${portal}-search/cli/src/cli.ts`,
    delayMs: 0,
  });
  return service;
}

/** CLI thoát khác 0 và in lỗi JSON ra stderr, y như `writeError` của các CLI portal. */
const failWith = (code: string) =>
  execFile.mockImplementation((_cmd, _args, _options, callback) => {
    callback(
      Object.assign(new Error('Command failed'), {
        stderr: JSON.stringify({ error: 'trang captcha', code }) + '\n',
      }),
    );
  });

beforeEach(() => {
  execFile.mockReset();
  jest.useFakeTimers({ doNotFake: ['setTimeout'] });
  jest.setSystemTime(new Date('2026-09-29T00:00:00Z'));
});

afterEach(() => jest.useRealTimers());

describe('PortalCliService · cầu dao BLOCKED', () => {
  test('CLI báo BLOCKED thì lần gọi sau ném ngay, KHÔNG chạy CLI nữa', async () => {
    const service = serviceWith('careerlink');
    failWith('BLOCKED');

    await expect(
      service.search('careerlink', { query: 'kế toán' }),
    ).rejects.toThrow('trang captcha');
    expect(execFile).toHaveBeenCalledTimes(1);

    await expect(service.detail('careerlink', 'x/1')).rejects.toThrow(
      'đang tạm ngừng',
    );
    await expect(
      service.search('careerlink', { query: 'java' }),
    ).rejects.toThrow('đang tạm ngừng');
    expect(execFile).toHaveBeenCalledTimes(1);
  });

  test('hết thời gian tạm ngừng thì gọi lại được', async () => {
    const service = serviceWith('careerlink');
    failWith('BLOCKED');
    await expect(service.search('careerlink', {})).rejects.toThrow();

    jest.setSystemTime(Date.now() + BLOCKED_COOLDOWN_MS + 1);
    execFile.mockImplementation((_cmd, _args, _options, callback) =>
      callback(null, { stdout: '[]', stderr: '' }),
    );

    await expect(service.search('careerlink', {})).resolves.toEqual([]);
    expect(execFile).toHaveBeenCalledTimes(2);
  });

  test('lỗi thường (mạng, 5xx) KHÔNG bật cầu dao', async () => {
    const service = serviceWith('careerlink');
    failWith('FETCH_FAILED');

    await expect(service.search('careerlink', {})).rejects.toThrow();
    await expect(service.search('careerlink', {})).rejects.toThrow(
      'trang captcha',
    );
    expect(execFile).toHaveBeenCalledTimes(2);
  });

  test('portal này bị chặn KHÔNG ảnh hưởng portal kia', async () => {
    const service = serviceWith('careerlink');
    (service as unknown as Internals).portals.set('topcv', {
      key: 'topcv',
      cliPath: 'x',
      delayMs: 0,
    });
    failWith('BLOCKED');
    await expect(service.search('careerlink', {})).rejects.toThrow();

    execFile.mockImplementation((_cmd, _args, _options, callback) =>
      callback(null, { stdout: '[]', stderr: '' }),
    );
    await expect(service.search('topcv', {})).resolves.toEqual([]);
  });
});
