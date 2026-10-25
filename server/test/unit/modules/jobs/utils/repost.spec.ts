import { repostSignal } from 'src/modules/jobs/utils/repost.js';

describe('repostSignal', () => {
  const day = (d: number) => new Date(Date.UTC(2026, 7, d));

  test('đăng lại cách nhau từ 14 ngày thì báo, kèm lần đầu và các ngày theo thứ tự', () => {
    expect(repostSignal([day(30), day(1), day(15)])).toEqual({
      count: 3,
      firstAt: day(1),
      dates: [day(1), day(15), day(30)],
    });
  });

  test('một lần đăng, hoặc các lần đăng dồn trong dưới 14 ngày, thì không báo', () => {
    expect(repostSignal([day(1)])).toBeNull();
    expect(repostSignal([day(1), day(10)])).toBeNull();
  });
});
