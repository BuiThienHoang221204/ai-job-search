import {
  QUEUES_WITH_KEY_RULE,
  singletonKeyFor,
} from 'src/modules/queue/queue-key.js';
import { QUEUE } from 'src/modules/queue/queue.service.js';

describe('singletonKeyFor', () => {
  /// Đây là test giữ cho hai danh sách không lệch nhau. `queue-key.ts` viết tên
  /// hàng đợi bằng chuỗi để tránh phụ thuộc vòng với `queue.service.ts`, nên nếu
  /// thêm một hàng đợi vào `QUEUE` mà quên khai khoá thì chỉ chỗ này phát hiện -
  /// và hậu quả của việc quên là policy `exclusive` coi cả hàng đợi là một khoá,
  /// chặn toàn bộ việc xuống còn một job.
  test('mọi hàng đợi trong QUEUE đều có luật khoá', () => {
    expect([...QUEUES_WITH_KEY_RULE].sort()).toEqual(
      Object.values(QUEUE).sort(),
    );
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
