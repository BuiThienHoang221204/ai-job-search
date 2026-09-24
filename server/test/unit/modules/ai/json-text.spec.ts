import { extractJson } from 'src/modules/ai/utils/json-text.js';

/// Lõi `omniroute` KHÔNG áp `response_format`, nên thứ duy nhất giữ định dạng là
/// lời nhắc trong prompt — và model thì hay viết thêm câu dẫn. Bộ bóc này là lưới
/// cuối cùng trước khi zod từ chối cả lượt gọi đã tốn tiền.
describe('extractJson', () => {
  test('JSON sạch thì trả về NGUYÊN VẸN', () => {
    expect(extractJson('{"diem":8}')).toBe('{"diem":8}');
    expect(extractJson('  {"diem":8}  ')).toBe('{"diem":8}');
  });

  test('bóc được hàng rào ```json bao trọn phản hồi', () => {
    expect(extractJson('```json\n{"diem":8}\n```')).toBe('{"diem":8}');
  });

  test('bóc được hàng rào nằm SAU một câu dẫn', () => {
    const raw =
      'Đây là kết quả đánh giá:\n\n```json\n{"diem":8}\n```\n\nChúc bạn may mắn!';
    expect(extractJson(raw)).toBe('{"diem":8}');
  });

  test('bóc được JSON trần lẫn trong văn xuôi, KHÔNG cần hàng rào', () => {
    expect(extractJson('Đây là kết quả: {"diem":8}')).toBe('{"diem":8}');
    expect(extractJson('{"diem":8} — hy vọng giúp được bạn.')).toBe(
      '{"diem":8}',
    );
  });

  /// "Từ `{` đầu tới `}` cuối" vỡ ở đúng ca này — nó nuốt cả dấu ngoặc trong văn
  /// xuôi phía sau và cho ra chuỗi không parse được.
  test('văn xuôi phía sau có dấu ngoặc cũng không làm lệch', () => {
    const raw = 'Kết quả: {"diem":8}. Lưu ý: điểm } không phải phần trăm {.';
    expect(extractJson(raw)).toBe('{"diem":8}');
  });

  test('dấu ngoặc NẰM TRONG chuỗi không tính vào độ sâu', () => {
    const raw = 'Kết quả: {"ghiChu":"dùng dấu } và { trong câu","diem":8}';
    expect(JSON.parse(extractJson(raw))).toEqual({
      ghiChu: 'dùng dấu } và { trong câu',
      diem: 8,
    });
  });

  test('dấu ngoặc kép đã thoát không mở lại chuỗi', () => {
    const raw = 'Kết quả: {"ghiChu":"anh ta nói \\"xong\\" rồi }","diem":8}';
    expect(JSON.parse(extractJson(raw))).toEqual({
      ghiChu: 'anh ta nói "xong" rồi }',
      diem: 8,
    });
  });

  test('bóc được mảng ở gốc', () => {
    expect(extractJson('Danh sách: [1,2,3] nhé')).toBe('[1,2,3]');
  });

  test('object LỒNG NHAU lấy đủ tới ngoặc đóng ngoài cùng', () => {
    const raw = 'Kết quả: {"a":{"b":{"c":1}},"d":2} xong';
    expect(JSON.parse(extractJson(raw))).toEqual({ a: { b: { c: 1 } }, d: 2 });
  });

  /// Không bóc được thì trả NGUYÊN VĂN, để câu lỗi phía trên vẫn in ra đúng thứ
  /// model đã viết — đó là thứ duy nhất cho biết nó hiểu sai chỗ nào.
  test('không có JSON nào thì trả nguyên văn', () => {
    const raw = 'Xin lỗi, tôi không thể đánh giá hồ sơ này.';
    expect(extractJson(raw)).toBe(raw);
  });

  test('JSON hỏng thì cũng trả nguyên văn, không trả nửa vời', () => {
    const raw = 'Kết quả: {"diem":8, "ghiChu":';
    expect(extractJson(raw)).toBe(raw);
  });

  /// Hỏng THẬT 2026-09-23: model viết object đầy đủ (3.077 token ra) nhưng bị
  /// cắt cụt. Bản cũ thử `{` không được thì thử tiếp `[`, và moi đúng mảng
  /// `strengths` ở giữa ruột ra — zod báo "expected object, received array",
  /// một thông báo lạc hướng hoàn toàn so với nguyên nhân là CẮT CỤT.
  test('object bị CẮT CỤT thì trả nguyên văn, KHÔNG moi mảng bên trong ra', () => {
    const raw =
      '{"eligibility":{"verdict":"PASS"},"strengths":["Kỹ năng vững","Kinh nghiệm fintech"],"gaps":["Thiếu kinh nghiệm';

    expect(extractJson(raw)).toBe(raw);
  });

  /// Cùng lý do: dấu mở ĐẦU TIÊN quyết định, không thử lần lượt từng loại.
  test('mảng nằm SAU một object hỏng cũng không được lấy', () => {
    const raw = '{"diem": {"a": 1, "b": ["x","y"]';

    expect(extractJson(raw)).toBe(raw);
  });

  test('chuỗi rỗng không làm ngã', () => {
    expect(extractJson('')).toBe('');
    expect(extractJson('   ')).toBe('   ');
  });
});
