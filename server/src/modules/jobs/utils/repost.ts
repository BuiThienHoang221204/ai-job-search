import { DAY_MS } from '@/common/duration';

const MIN_SPAN_DAYS = 14;

/** Tin cùng công ty, tên vị trí và tỉnh được đăng lại thành tin mới: chỉ báo khi có từ hai lần đăng cách nhau ít nhất 14 ngày. */
export function repostSignal(
  dates: Date[],
): { count: number; firstAt: Date; dates: Date[] } | null {
  if (dates.length < 2) return null;
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const span = sorted[sorted.length - 1].getTime() - sorted[0].getTime();
  if (span < MIN_SPAN_DAYS * DAY_MS) return null;
  return { count: sorted.length, firstAt: sorted[0], dates: sorted };
}
