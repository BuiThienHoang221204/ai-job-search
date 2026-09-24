import { picksFor } from 'src/modules/matching/ai/utils/merge-picks.js';

describe('picksFor', () => {
  it('gom đủ lựa chọn khi model trả lời hết các dòng được hỏi', () => {
    const picks = picksFor(
      [
        { term: 1, match: 2 },
        { term: 2, match: 0 },
      ],
      [1, 2],
    );

    expect(picks).not.toBeNull();
    expect(picks!.get(1)).toBe(2);
    expect(picks!.get(2)).toBe(0);
  });

  // Ca hỏng thật: auto/fast trả ~17 token đầu ra, `decisions: []` vẫn qua schema.
  it('trả null khi model trả mảng rỗng', () => {
    expect(picksFor([], [1, 2, 3])).toBeNull();
  });

  it('trả null khi model chỉ trả lời một phần', () => {
    expect(picksFor([{ term: 1, match: 0 }], [1, 2])).toBeNull();
  });

  it('trả null khi model trả đủ số dòng nhưng lạc số thứ tự', () => {
    expect(
      picksFor(
        [
          { term: 1, match: 0 },
          { term: 9, match: 0 },
        ],
        [1, 2],
      ),
    ).toBeNull();
  });

  it('bỏ qua dòng thừa không có trong đề bài', () => {
    const picks = picksFor(
      [
        { term: 1, match: 3 },
        { term: 7, match: 1 },
      ],
      [1],
    );

    expect(picks).not.toBeNull();
    expect(picks!.get(1)).toBe(3);
  });

  it('lấy lần trả lời SAU khi model lặp lại một số thứ tự', () => {
    const picks = picksFor(
      [
        { term: 1, match: 2 },
        { term: 1, match: 0 },
      ],
      [1],
    );

    expect(picks!.get(1)).toBe(0);
  });
});
