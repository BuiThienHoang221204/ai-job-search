import {
  embeddingSourceHash,
  jobEmbeddingText,
  profileEmbeddingText,
} from 'src/modules/semantic/embed-text.js';
import {
  EMBEDDING_DIM,
  truncateAndNormalise,
} from 'src/modules/semantic/semantic-index.js';

const job = {
  title: 'Kế toán tổng hợp',
  company: 'Công ty ABC',
  location: 'Hà Nội',
  tags: ['kế toán', 'thuế'],
  description: 'Lập báo cáo tài chính, quyết toán thuế.',
};

const profile = {
  headline: 'Kế toán tổng hợp',
  location: 'Hà Nội',
  summary: '5 năm kinh nghiệm.',
  primarySkills: ['Excel', 'Misa'],
  secondarySkills: [],
  directExperienceDomains: ['Sản xuất'],
  targetSectors: ['Ngân hàng'],
  careerGoals: ['Trở thành Kế toán trưởng'],
};

describe('jobEmbeddingText', () => {
  test('gom các trường có nghĩa vào một đoạn', () => {
    const text = jobEmbeddingText(job);
    expect(text).toContain('Kế toán tổng hợp');
    expect(text).toContain('Công ty ABC');
    expect(text).toContain('quyết toán thuế');
  });

  test('bỏ qua trường rỗng thay vì để nhãn trống', () => {
    const text = jobEmbeddingText({ ...job, location: null, tags: [] });
    expect(text).not.toContain('Địa điểm');
    expect(text).not.toContain('Từ khoá');
  });

  test('cắt mô tả quá dài — model chỉ nhận 8.192 token', () => {
    const text = jobEmbeddingText({ ...job, description: 'x'.repeat(10_000) });
    expect(text.length).toBeLessThan(5_000);
  });
});

describe('profileEmbeddingText', () => {
  test('gom kỹ năng, lĩnh vực và mục tiêu', () => {
    const text = profileEmbeddingText(profile);
    expect(text).toContain('Excel, Misa');
    expect(text).toContain('Ngân hàng');
    expect(text).toContain('Kế toán trưởng');
  });

  test('KHÔNG mang theo thông tin định danh', () => {
    /*
     * Đoạn văn bản này được gửi ra dịch vụ ngoài, và free tier của các nhà cung
     * cấp thường cho phép dùng dữ liệu gửi lên để huấn luyện. Tên riêng cũng
     * không đóng góp gì cho độ tương đồng ngữ nghĩa — nên bỏ ra vừa đúng kỹ
     * thuật vừa đúng quyền riêng tư.
     *
     * Test này đỏ khi ai đó thêm một trường định danh vào hàm.
     */
    const text = profileEmbeddingText({
      ...profile,
      summary: 'Nguyễn Văn A, 0900123456, nguyenvana@example.com',
    });

    // Chỉ `summary` mang dữ liệu đó, và nó vẫn vào — đây là giới hạn đã biết:
    // hàm không lọc nội dung bên trong một trường. Cái nó bảo đảm là KHÔNG có
    // trường định danh nào được đưa vào danh sách.
    const nhan = text
      .split('\n')
      .map((dong) => dong.split(':')[0])
      .sort();
    expect(nhan).not.toContain('Họ tên');
    expect(nhan).not.toContain('Email');
    expect(nhan).not.toContain('Điện thoại');
    expect(nhan).not.toContain('Quốc tịch');
  });
});

describe('embeddingSourceHash', () => {
  test('cùng nội dung cho cùng hash, khác nội dung cho khác hash', () => {
    expect(embeddingSourceHash('a')).toBe(embeddingSourceHash('a'));
    expect(embeddingSourceHash('a')).not.toBe(embeddingSourceHash('b'));
  });
});

describe('truncateAndNormalise', () => {
  test('cắt về đúng số chiều của cột database', () => {
    const raw = Array.from({ length: 3072 }, (_, i) => i + 1);
    expect(truncateAndNormalise(raw)).toHaveLength(EMBEDDING_DIM);
  });

  test('chuẩn hoá về độ dài 1 — bắt buộc với vector_cosine_ops', () => {
    // Cắt bớt chiều làm vector không còn dài 1. Không chuẩn hoá lại thì khoảng
    // cách giữa hai vector cắt khác nhau không so được với nhau.
    const raw = Array.from({ length: 1000 }, () => 3);
    const norm = Math.sqrt(
      truncateAndNormalise(raw).reduce((s, v) => s + v * v, 0),
    );
    expect(norm).toBeCloseTo(1, 10);
  });

  test('vector ngắn hơn số chiều thì ném lỗi, không im lặng đệm thêm 0', () => {
    // Đệm 0 sẽ cho ra một vector "hợp lệ" nhưng vô nghĩa, và nó sẽ nằm im trong
    // database cho tới khi ai đó thắc mắc vì sao kết quả tìm kiếm kỳ lạ.
    expect(() => truncateAndNormalise([1, 2, 3])).toThrow(/chiều/);
  });
});
