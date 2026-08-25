import { DEFAULT_PAGE_SIZE } from 'src/common/dto/pagination.dto.js';
import { pageArgs, pageOf } from 'src/common/pagination.js';

/// Hợp đồng phân trang dùng chung cho mọi API danh sách.
///
/// Đáng có test riêng vì hai thứ dễ trôi: `limit`/`offset` trả về phải là giá
/// trị THẬT ĐÃ DÙNG (sau khi áp mặc định), chứ không phải thứ client gửi lên -
/// giao diện dựng thanh phân trang từ chính hai số này, nên trả lại `undefined`
/// là vẽ ra "trang NaN".
describe('pageArgs', () => {
  test('không truyền gì thì áp mặc định', () => {
    expect(pageArgs()).toEqual({ take: DEFAULT_PAGE_SIZE, skip: 0 });
  });

  test('giữ nguyên giá trị client gửi lên', () => {
    expect(pageArgs({ limit: 50, offset: 100 })).toEqual({
      take: 50,
      skip: 100,
    });
  });

  test('offset = 0 không bị coi là thiếu', () => {
    expect(pageArgs({ limit: 5, offset: 0 }).skip).toBe(0);
  });
});

describe('pageOf', () => {
  test('total là tổng thật, không phải độ dài trang', () => {
    const page = pageOf(['a', 'b'], 137, { limit: 2, offset: 20 });

    expect(page).toEqual({
      items: ['a', 'b'],
      total: 137,
      limit: 2,
      offset: 20,
    });
  });

  test('limit trả về là giá trị đã áp mặc định, không phải undefined', () => {
    expect(pageOf([], 0)).toEqual({
      items: [],
      total: 0,
      limit: DEFAULT_PAGE_SIZE,
      offset: 0,
    });
  });
});
