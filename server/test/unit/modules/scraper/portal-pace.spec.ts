import type { ConfigService } from '@nestjs/config';
import { PortalCliService } from 'src/modules/scraper/services/portal-cli.service.js';

/*
 * Nhịp chống chặn IP từng nằm ở HAI chỗ: `pace()` trong adapter (3.000ms giữa
 * hai lần GỌI) và một `sleep(1.200ms)` do người gọi tự nhớ viết. Nay gộp làm
 * một, và hai ràng buộc đó phải còn nguyên - hỏng thì không có gì báo, chỉ là
 * portal bắt đầu chặn IP sau vài đêm.
 */

const config = {
  get: (key: string) =>
    ({
      'scraper.portalsDir': '/khong-ton-tai',
      'scraper.timeoutMs': 60_000,
      'scraper.portalDelayMs': 3_000,
    })[key],
} as unknown as ConfigService;

/** Gọi thẳng `pace` và `lastDoneAt` - dựng CLI thật chỉ để đo nhịp là quá đắt. */
type Paced = {
  pace(portal: string): Promise<void>;
  lastDoneAt: Map<string, number>;
  lastCallAt: Map<string, number>;
};

const paced = (): Paced => new PortalCliService(config) as unknown as Paced;

/** Đo số mili giây `pace` thật sự chờ, dưới đồng hồ giả. */
async function waitedMs(service: Paced, portal: string): Promise<number> {
  const before = Date.now();
  const pending = service.pace(portal);
  await jest.runAllTimersAsync();
  await pending;
  return Date.now() - before;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-09-23T00:00:00Z'));
});

afterEach(() => {
  jest.useRealTimers();
});

describe('PortalCliService.pace', () => {
  test('lần gọi đầu tiên không chờ', async () => {
    expect(await waitedMs(paced(), 'topcv')).toBe(0);
  });

  test('CLI nhanh: nhịp do mốc GỌI quyết định, đủ 3.000ms', async () => {
    const service = paced();
    const now = Date.now();
    service.lastCallAt.set('topcv', now);
    service.lastDoneAt.set('topcv', now + 1_000);

    expect(await waitedMs(service, 'topcv')).toBe(3_000);
  });

  test('CLI chậm: mốc XONG mới là ràng buộc, nghỉ thêm 1.200ms', async () => {
    const service = paced();
    const now = Date.now();
    service.lastCallAt.set('topcv', now - 5_000);
    service.lastDoneAt.set('topcv', now);

    expect(await waitedMs(service, 'topcv')).toBe(1_200);
  });

  test('nghỉ đủ rồi thì đi ngay, không chờ thêm', async () => {
    const service = paced();
    const now = Date.now();
    service.lastCallAt.set('topcv', now - 9_000);
    service.lastDoneAt.set('topcv', now - 4_000);

    expect(await waitedMs(service, 'topcv')).toBe(0);
  });

  test('chờ portal này KHÔNG hoãn portal kia', async () => {
    const service = paced();
    service.lastCallAt.set('topcv', Date.now());
    service.lastDoneAt.set('topcv', Date.now());

    expect(await waitedMs(service, 'itviec')).toBe(0);
  });
});
