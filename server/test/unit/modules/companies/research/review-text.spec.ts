import {
  stripChrome,
  trimToReviewText,
} from 'src/modules/companies/research/review-text.js';

/// Trang công ty TopCV đo được 9.263 ký tự mà phần lớn là banner cookie. Không
/// cắt thì nó chiếm mất ngân sách của nội dung thật.
describe('stripChrome', () => {
  test('bỏ dòng banner cookie và điều khoản', () => {
    const text = [
      'TopCV sử dụng cookie để đảm bảo tính năng thiết yếu.',
      'Môi trường làm việc thoải mái, sếp dễ chịu.',
      'Chấp nhận tất cả',
      'Xem chính sách bảo mật của chúng tôi.',
    ].join('\n');

    expect(stripChrome(text)).toBe(
      'Môi trường làm việc thoải mái, sếp dễ chịu.',
    );
  });

  test('không đụng tới nội dung thật', () => {
    const text = 'Lương ổn, đồng nghiệp thân thiện.\nQuản lý hơi xa cách.';
    expect(stripChrome(text)).toBe(text);
  });
});

const filler = (n: number) => 'x'.repeat(n);

describe('trimToReviewText', () => {
  test('trang ngắn hơn ngân sách thì giữ nguyên', () => {
    const text = 'Công ty này môi trường tốt';
    expect(trimToReviewText(text, 5_000)).toBe(text);
  });

  test('giữ đoạn quanh từ khoá, bỏ phần nhiễu ở xa', () => {
    const text = `${filler(3_000)} lương ở đây khá ổn ${filler(3_000)}`;
    const trimmed = trimToReviewText(text, 2_000);

    expect(trimmed).toContain('lương ở đây khá ổn');
    expect(trimmed.length).toBeLessThanOrEqual(2_000);
  });

  test('gộp hai từ khoá gần nhau thành một đoạn liền', () => {
    const text = `${filler(2_000)} môi trường tốt, đồng nghiệp thân thiện ${filler(2_000)}`;
    const trimmed = trimToReviewText(text, 2_000);

    expect(trimmed).toContain('môi trường tốt, đồng nghiệp thân thiện');
    expect(trimmed.split('…')).toHaveLength(1);
  });

  test('hai vùng cách xa nhau được nối bằng dấu lược', () => {
    const text = `${filler(200)} lương cao ${filler(4_000)} quản lý tệ ${filler(200)}`;
    const trimmed = trimToReviewText(text, 3_000);

    expect(trimmed).toContain('lương cao');
    expect(trimmed).toContain('quản lý tệ');
    expect(trimmed).toContain('…');
    expect(trimmed.length).toBeLessThanOrEqual(3_000);
  });

  test('bắt được cả bản viết không dấu', () => {
    const text = `${filler(3_000)} moi truong lam viec ok ${filler(3_000)}`;
    expect(trimToReviewText(text, 2_000)).toContain('moi truong lam viec ok');
  });

  test('không có từ khoá nào thì cắt từ đầu, không trả rỗng', () => {
    const text = filler(9_000);
    const trimmed = trimToReviewText(text, 1_000);

    expect(trimmed).toHaveLength(1_000);
  });

  test('không bao giờ vượt ngân sách dù trang lặp từ khoá dày đặc', () => {
    const text = 'lương thưởng phúc lợi môi trường quản lý '.repeat(500);
    expect(trimToReviewText(text, 1_500).length).toBeLessThanOrEqual(1_500);
  });
});

/// Chọn theo thứ tự trang đã đo là hỏng trên trang công ty TopCV: khẩu hiệu đầu
/// trang chứa đúng một từ khoá nhưng nằm trên cùng nên chiếm hết ngân sách.
describe('trimToReviewText ưu tiên theo mật độ', () => {
  /// Cả hai vùng đều nằm giữa trang nên cửa sổ của chúng bằng nhau; ngân sách
  /// vừa đủ MỘT cửa sổ, nên test kiểm đúng thứ tự ưu tiên chứ không phụ thuộc
  /// vào việc cửa sổ dài bao nhiêu.
  const THUA = 'Kết nối bền chặt cùng đồng nghiệp cũng là một lợi thế. ';
  const DAC = 'Lương ổn, phúc lợi tốt, quản lý quan tâm, văn hóa cởi mở.';
  const TRANG = `${filler(1_000)}${THUA}${filler(2_000)}${DAC}${filler(1_000)}`;
  const MOT_CUA_SO = 800;

  test('vùng đặc từ khoá thắng vùng thưa nằm trước nó', () => {
    const trimmed = trimToReviewText(TRANG, MOT_CUA_SO);

    expect(trimmed).toContain('quản lý quan tâm');
    expect(trimmed).not.toContain('lợi thế');
  });

  test('ngân sách rộng thì vùng thưa vẫn được lấy, chỉ là xếp sau', () => {
    const trimmed = trimToReviewText(TRANG, MOT_CUA_SO * 2 + 100);

    expect(trimmed).toContain('quản lý quan tâm');
    expect(trimmed).toContain('lợi thế');
  });

  test('giữ thứ tự trang khi in ra, dù chọn theo mật độ', () => {
    const dau = 'Lương thưởng phúc lợi quản lý văn hóa môi trường đồng nghiệp.';
    const cuoi =
      'Lương thưởng phúc lợi quản lý văn hóa môi trường đồng nghiệp tăng ca.';
    const trimmed = trimToReviewText(
      `${dau}${filler(3_000)} sếp ${filler(3_000)}${cuoi}`,
      2_500,
    );

    expect(trimmed.indexOf('đồng nghiệp.')).toBeLessThan(
      trimmed.indexOf('tăng ca'),
    );
  });
});
