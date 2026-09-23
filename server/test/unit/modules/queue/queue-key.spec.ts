import { singletonKeyFor } from 'src/modules/queue/queue-key.js';
import { QUEUE } from 'src/modules/queue/queue.constants.js';

describe('singletonKeyFor', () => {
  /// Thêm một hàng đợi vào `QUEUE` mà quên khai khoá thì CHỈ chỗ này phát hiện,
  /// và hậu quả của việc quên là policy `exclusive` coi cả hàng đợi là một khoá,
  /// chặn toàn bộ việc xuống còn một job.
  ///
  /// Gọi với payload RỖNG là cố ý: ta chỉ hỏi "nhánh này có tồn tại không". Một
  /// lỗi "thiếu trường" chứng minh nhánh có; rơi vào `default` mới là quên. Bản
  /// cũ so hai danh sách tên hàng đợi, nhưng danh sách thứ hai đã bị xoá - nó
  /// chỉ tồn tại để tránh một phụ thuộc vòng nay không còn.
  test('mọi hàng đợi trong QUEUE đều có nhánh khoá riêng', () => {
    for (const queue of Object.values(QUEUE)) {
      try {
        singletonKeyFor(queue, {});
      } catch (error) {
        expect((error as Error).message).not.toMatch(/chưa khai khoá dedup/);
      }
    }
  });

  test('mỗi hàng đợi dựng được khoá từ payload hợp lệ', () => {
    expect(
      singletonKeyFor(QUEUE.EVALUATE_MATCH, { userId: 'u1', jobId: 'j1' }),
    ).toBe('u1:j1:cache');
    expect(
      singletonKeyFor(QUEUE.INTERVIEW_PREP, { userId: 'u1', jobId: 'j1' }),
    ).toBe('u1:j1:cache');
    expect(
      singletonKeyFor(QUEUE.UPSKILL_REPORT, { userId: 'u1', reportId: 'r1' }),
    ).toBe('r1');
    expect(
      singletonKeyFor(QUEUE.GENERATE_DOCUMENT, {
        userId: 'u1',
        documentId: 'd1',
      }),
    ).toBe('d1');
    expect(singletonKeyFor(QUEUE.SCRAPE_RUN, { runId: 'run1' })).toBe('run1');
    expect(
      singletonKeyFor(QUEUE.COMPANY_BRIEF, {
        nameKey: 'fpt software',
        company: 'FPT Software',
      }),
    ).toBe('fpt software:cache');
  });

  describe('khoá rút yêu cầu đi theo LÔ', () => {
    test('cùng một lô cho ra cùng một khoá dù thứ tự khác nhau', () => {
      const first = singletonKeyFor(QUEUE.EXTRACT_REQUIREMENTS, {
        jobIds: ['j1', 'j2', 'j3'],
      });
      const second = singletonKeyFor(QUEUE.EXTRACT_REQUIREMENTS, {
        jobIds: ['j3', 'j1', 'j2'],
      });

      expect(first).toBe(second);
    });

    test('hai lô khác nhau cho hai khoá khác nhau', () => {
      expect(
        singletonKeyFor(QUEUE.EXTRACT_REQUIREMENTS, { jobIds: ['j1', 'j2'] }),
      ).not.toBe(
        singletonKeyFor(QUEUE.EXTRACT_REQUIREMENTS, { jobIds: ['j1', 'j3'] }),
      );
    });

    test('khoá đủ ngắn cho cột singleton_key của pg-boss', () => {
      const key = singletonKeyFor(QUEUE.EXTRACT_REQUIREMENTS, {
        jobIds: Array.from({ length: 5 }, (_, i) => `clx${'0'.repeat(21)}${i}`),
      });

      expect(key.length).toBeLessThanOrEqual(64);
    });

    test('mảng rỗng bị từ chối thay vì dựng một khoá vô nghĩa', () => {
      expect(() =>
        singletonKeyFor(QUEUE.EXTRACT_REQUIREMENTS, { jobIds: [] }),
      ).toThrow(/jobIds/);
    });
  });

  /// Bản tìm hiểu công ty dùng chung cho mọi người, nên hai người mở cùng một
  /// tin phải gộp làm một lượt. Lọt `userId` vào khoá là trả tiền hai lần cho
  /// cùng một kết quả.
  test('khoá tìm hiểu công ty không phụ thuộc người dùng', () => {
    const first = singletonKeyFor(QUEUE.COMPANY_BRIEF, {
      nameKey: 'fpt software',
      company: 'Công ty TNHH FPT Software',
    });
    const second = singletonKeyFor(QUEUE.COMPANY_BRIEF, {
      nameKey: 'fpt software',
      company: 'FPT Software',
    });

    expect(first).toBe(second);
  });

  /// `force` phải nằm trong khoá, nếu không một yêu cầu chấm LẠI sẽ bị gộp vào
  /// job đang chờ - job đó thấy promptHash không đổi nên trả kết quả cache, tức
  /// là người dùng bấm "chấm lại" mà không có gì xảy ra.
  test('force=true tạo khoá khác với force=false', () => {
    const cached = singletonKeyFor(QUEUE.EVALUATE_MATCH, {
      userId: 'u1',
      jobId: 'j1',
      force: false,
    });
    const forced = singletonKeyFor(QUEUE.EVALUATE_MATCH, {
      userId: 'u1',
      jobId: 'j1',
      force: true,
    });

    expect(cached).not.toBe(forced);
    expect(forced).toBe('u1:j1:force');
  });

  test('hai người dùng khác nhau trên cùng công việc có khoá khác nhau', () => {
    const first = singletonKeyFor(QUEUE.EVALUATE_MATCH, {
      userId: 'u1',
      jobId: 'j1',
    });
    const second = singletonKeyFor(QUEUE.EVALUATE_MATCH, {
      userId: 'u2',
      jobId: 'j1',
    });

    expect(first).not.toBe(second);
  });

  /// Thiếu trường phải nổ ngay chỗ xếp hàng. Nếu để lọt, khoá thành
  /// "undefined:undefined" và MỌI việc khác nhau bị gộp thành một - hỏng im lặng
  /// và rất khó truy về nguyên nhân.
  describe('payload thiếu trường', () => {
    test.each([
      [QUEUE.EVALUATE_MATCH, { userId: 'u1' }, 'jobId'],
      [QUEUE.EVALUATE_MATCH, { jobId: 'j1' }, 'userId'],
      [QUEUE.GENERATE_DOCUMENT, { userId: 'u1' }, 'documentId'],
      [QUEUE.UPSKILL_REPORT, { userId: 'u1' }, 'reportId'],
      [QUEUE.SCRAPE_RUN, {}, 'runId'],
    ])('%s thiếu %s thì ném lỗi', (queue, payload, missing) => {
      expect(() => singletonKeyFor(queue, payload)).toThrow(
        new RegExp(missing),
      );
    });

    test('trường rỗng cũng bị từ chối, không chỉ trường vắng mặt', () => {
      expect(() =>
        singletonKeyFor(QUEUE.GENERATE_DOCUMENT, { documentId: '' }),
      ).toThrow(/documentId/);
    });
  });

  test('hàng đợi lạ thì ném lỗi thay vì đoán một khoá', () => {
    expect(() => singletonKeyFor('queue.khong-ton-tai', { id: '1' })).toThrow(
      /chưa khai khoá dedup/,
    );
  });
});
