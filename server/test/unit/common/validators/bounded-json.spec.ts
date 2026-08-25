import { checkJsonBounds } from 'src/common/validators/bounded-json.js';

const bounds = { maxBytes: 1_000, maxItems: 5, maxDepth: 4 };

/// Đây là chốt chặn duy nhất quyết định cái gì lọt vào prompt gửi lên nhà cung
/// cấp model. Năm trường hồ sơ đi qua đây rồi được `JSON.stringify` thẳng vào
/// prompt, nên mọi thứ lọt qua đều trở thành chi phí trên MỖI lần chấm điểm.
describe('checkJsonBounds', () => {
  describe('hình dạng', () => {
    test('nhận mảng và object', () => {
      expect(checkJsonBounds([], bounds)).toBeNull();
      expect(checkJsonBounds({}, bounds)).toBeNull();
      expect(checkJsonBounds([{ a: 1 }], bounds)).toBeNull();
    });

    /// Không đoán ý người gửi ở tầng validation: một chuỗi lọt vào đây nghĩa là
    /// client gửi sai hình dạng, và tự bọc nó thành mảng sẽ giấu mất lỗi đó.
    test.each([
      ['chuỗi', 'kinh nghiệm'],
      ['số', 42],
      ['boolean', true],
      ['null', null],
    ])('từ chối %s', (_label, value) => {
      expect(checkJsonBounds(value, bounds)).toBe('not-json-container');
    });

    /// Cấu trúc vòng bị chặn bởi phép kiểm ĐỘ SÂU, không phải bởi nhánh bắt lỗi
    /// của `JSON.stringify` — vì độ sâu chạy trước. Như vậy tốt hơn: một vòng lặp
    /// bị chặn bằng phép đếm có trần, không phải bằng việc chờ một ngoại lệ. Lý do
    /// duyệt cây không treo là `depthOf` dừng ngay khi vượt trần.
    ///
    /// Nhánh `not-json-container` cho lỗi stringify vẫn giữ, như lưới cuối cho
    /// những giá trị không tuần tự hoá được mà vẫn nông (ví dụ BigInt).
    test('cấu trúc vòng bị chặn và KHÔNG làm treo phép duyệt', () => {
      const circular: Record<string, unknown> = {};
      circular.self = circular;

      expect(checkJsonBounds(circular, bounds)).toBe('too-deep');
    });

    test('giá trị không tuần tự hoá được nhưng nông thì rơi vào nhánh stringify', () => {
      expect(checkJsonBounds({ big: BigInt(1) }, bounds)).toBe(
        'not-json-container',
      );
    });
  });

  describe('số phần tử', () => {
    test('nhận mảng đúng bằng trần', () => {
      expect(checkJsonBounds([1, 2, 3, 4, 5], bounds)).toBeNull();
    });

    test('từ chối mảng vượt trần', () => {
      expect(checkJsonBounds([1, 2, 3, 4, 5, 6], bounds)).toBe(
        'too-many-items',
      );
    });

    /// Trần phần tử chỉ áp cho mảng ở tầng ngoài cùng; object nhiều khoá vẫn bị
    /// chặn bởi trần dung lượng.
    test('object nhiều khoá không bị trần phần tử chặn', () => {
      const many = Object.fromEntries(
        Array.from({ length: 20 }, (_, i) => [`k${i}`, i]),
      );

      expect(checkJsonBounds(many, bounds)).toBeNull();
    });
  });

  describe('độ sâu', () => {
    const nest = (depth: number): unknown =>
      depth <= 1 ? 'đáy' : { child: nest(depth - 1) };

    test('nhận cấu trúc đúng bằng độ sâu cho phép', () => {
      expect(checkJsonBounds(nest(4), bounds)).toBeNull();
    });

    /// Kiểm độ sâu TRƯỚC dung lượng là có chủ đích: một cấu trúc lồng vài nghìn
    /// tầng vẫn rất nhỏ sau khi stringify, nhưng đủ để làm mọi bước duyệt cây
    /// phía sau tốn kém bất thường.
    test('từ chối cấu trúc lồng quá sâu dù rất nhỏ', () => {
      const deep = nest(50);

      expect(JSON.stringify(deep).length).toBeLessThan(bounds.maxBytes);
      expect(checkJsonBounds(deep, bounds)).toBe('too-deep');
    });

    test('mảng lồng nhau cũng tính vào độ sâu', () => {
      expect(checkJsonBounds([[[[['quá sâu']]]]], bounds)).toBe('too-deep');
    });
  });

  describe('dung lượng', () => {
    test('từ chối khối vượt trần byte', () => {
      const big = [{ text: 'x'.repeat(2_000) }];

      expect(checkJsonBounds(big, bounds)).toBe('too-large');
    });

    /// Đo bằng BYTE chứ không bằng số ký tự: tiếng Việt có dấu chiếm 2-3 byte
    /// mỗi ký tự trong UTF-8, nên đếm ký tự sẽ cho một hồ sơ tiếng Việt lọt qua
    /// với dung lượng thật gấp ba lần trần.
    test('tính theo byte UTF-8, không theo số ký tự', () => {
      // 400 ký tự tiếng Việt có dấu -> hơn 1000 byte.
      const vietnamese = [{ text: 'ề'.repeat(400) }];

      expect(JSON.stringify(vietnamese).length).toBeLessThan(bounds.maxBytes);
      expect(checkJsonBounds(vietnamese, bounds)).toBe('too-large');
    });
  });

  test('độ sâu mặc định đủ cho dữ liệu hồ sơ thật', () => {
    const experience = [
      {
        company: 'Công ty A',
        roles: [{ title: 'Dev', achievements: ['Làm được việc'] }],
      },
    ];

    expect(
      checkJsonBounds(experience, { maxBytes: 64_000, maxItems: 100 }),
    ).toBeNull();
  });
});
