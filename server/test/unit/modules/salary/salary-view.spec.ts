import {
  occupationName,
  orderBands,
  rankPeers,
} from 'src/modules/salary/utils/salary-view.js';
import { EXPERIENCE_LABELS } from 'src/modules/salary/salary.types.js';

const band = (experienceLabel: string) => ({ experienceLabel });

const peer = (positionSlug: string, avgMonthly: number) => ({
  positionSlug,
  positionName: positionSlug,
  avgMonthly,
});

describe('orderBands', () => {
  /// Nhãn giữ nguyên chữ của nguồn nên không sắp theo bảng chữ cái được:
  /// "1–3 năm" phải đứng sau "Dưới 1 năm".
  test('xếp theo thứ tự thời gian, không theo bảng chữ cái', () => {
    const shuffled = ['Trên 5 năm', 'Dưới 1 năm', '3–5 năm', '1–3 năm'].map(
      band,
    );

    expect(orderBands(shuffled).map((b) => b.experienceLabel)).toEqual([
      ...EXPERIENCE_LABELS,
    ]);
  });

  /// Bản cũ dùng `order.indexOf(...)` trần, trả -1 cho nhãn lạ nên nó LÊN ĐẦU
  /// bảng - trước cả "Dưới 1 năm" - mà không có lỗi nào. Nguồn đổi tên nhãn là
  /// đủ để sập, và triệu chứng chỉ là bảng hiện sai thứ tự.
  test('nhãn LẠ xuống cuối, không nhảy lên đầu', () => {
    const rows = ['Trên 5 năm', 'Chưa phân loại', 'Dưới 1 năm'].map(band);

    expect(orderBands(rows).map((b) => b.experienceLabel)).toEqual([
      'Dưới 1 năm',
      'Trên 5 năm',
      'Chưa phân loại',
    ]);
  });

  test('không sửa mảng gốc', () => {
    const rows = ['Trên 5 năm', 'Dưới 1 năm'].map(band);
    orderBands(rows);
    expect(rows[0].experienceLabel).toBe('Trên 5 năm');
  });
});

describe('rankPeers', () => {
  const rows = [
    peer('a', 90),
    peer('b', 80),
    peer('c', 70),
    peer('d', 60),
    peer('e', 50),
  ];

  test('cắt đúng trần và đánh số hạng theo cả bảng', () => {
    const shown = rankPeers(rows, 'a', 3);

    expect(shown.map((r) => r.positionSlug)).toEqual(['a', 'b', 'c']);
    expect(shown.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  /// Thiếu vị trí đang xem thì bảng xếp hạng không nói được người đọc đang đứng
  /// ở đâu - đúng việc mà bảng này sinh ra để làm.
  test('vị trí đang xem KHÔNG lọt top vẫn được thêm vào, giữ đúng hạng thật', () => {
    const shown = rankPeers(rows, 'e', 3);

    expect(shown.map((r) => r.positionSlug)).toEqual(['a', 'b', 'c', 'e']);
    expect(shown.find((r) => r.positionSlug === 'e')?.rank).toBe(5);
    expect(shown.filter((r) => r.isCurrent)).toHaveLength(1);
  });

  test('vị trí đang xem đã nằm trong top thì KHÔNG bị thêm lần hai', () => {
    const shown = rankPeers(rows, 'b', 3);

    expect(shown.map((r) => r.positionSlug)).toEqual(['a', 'b', 'c']);
    expect(shown.filter((r) => r.isCurrent)).toHaveLength(1);
  });

  test('slug lạ thì chỉ trả top, không đánh dấu ai là hiện tại', () => {
    const shown = rankPeers(rows, 'khong-ton-tai', 2);

    expect(shown.map((r) => r.positionSlug)).toEqual(['a', 'b']);
    expect(shown.some((r) => r.isCurrent)).toBe(false);
  });
});

describe('occupationName', () => {
  test('mã lạ trả null chứ không trả chính mã', () => {
    expect(occupationName('KHONG_CO_MA_NAY')).toBeNull();
    expect(occupationName(null)).toBeNull();
  });

  test('mã có thật trả tên tiếng Việt', () => {
    expect(occupationName('IT')).toBeTruthy();
    expect(occupationName('IT')).not.toBe('IT');
  });
});
