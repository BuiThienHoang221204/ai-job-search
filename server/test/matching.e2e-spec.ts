import type { Evaluation } from 'src/modules/matching/evaluation.schema.js';
import { MatchingService } from 'src/modules/matching/matching.service.js';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from './support/app-harness.js';

/// Một kết quả chấm điểm hợp lệ để xếp sẵn cho `FakeAi`.
///
/// Phải hợp lệ thật: `FakeAi` chạy `schema.parse` trên dữ liệu xếp sẵn, nên không
/// thể dựng bừa một object gần đúng. Đó là chủ ý - nó ngăn test xanh với hình dạng
/// mà model thật không bao giờ trả được.
///
/// Điểm tổng: 80*0.3 + 60*0.25 + 70*0.15 + 90*0.3 = 76.5 -> 77 -> STRONG.
const evaluation = (): Evaluation => ({
  eligibility: {
    verdict: 'PASS',
    quote: '',
    note: 'Tin không đòi quốc tịch và ứng viên có quyền làm việc tại Việt Nam.',
  },
  technical: {
    score: 80,
    note: 'Hồ sơ có React và NestJS, khớp yêu cầu chính của tin tuyển dụng.',
  },
  experience: {
    score: 60,
    note: 'Một năm kinh nghiệm, thấp hơn mức hai năm mà tin yêu cầu.',
  },
  behavioral: {
    score: 70,
    note: 'Hồ sơ cho thấy khả năng tự học và phối hợp trong nhóm nhỏ.',
  },
  career: {
    score: 90,
    note: 'Vị trí khớp với định hướng fullstack mà ứng viên đang theo.',
  },
  location: {
    pass: true,
    note: 'Vị trí đặt tại Hà Nội, trùng với nơi ứng viên đang sống.',
  },
  strengths: ['Thành thạo React và NextJS đúng như tin tuyển dụng yêu cầu.'],
  gaps: ['Chưa có kinh nghiệm Docker mà tin nêu là điểm cộng.'],
  recommendation: 'Nên ứng tuyển và nhấn mạnh phần kinh nghiệm frontend.',
});

describe('Chấm điểm: cache và giành quyền', () => {
  let harness: TestApp;
  let matching: MatchingService;

  beforeAll(async () => {
    harness = await createTestApp();
    matching = harness.app.get(MatchingService);
  });

  afterAll(async () => {
    await harness.close();
  });

  let user: TestUser;
  let jobId: string;

  beforeEach(async () => {
    await harness.reset();
    user = await harness.signUp();

    const job = await harness.prisma.job.create({
      data: {
        source: 'test',
        externalId: 'tin-1',
        url: 'https://example.test/tin-1',
        title: 'Fullstack Developer',
        company: 'Công ty Thử Nghiệm',
        location: 'Hà Nội',
        description:
          'Tuyển Fullstack Developer biết React, NextJS và NestJS. Yêu cầu hai năm kinh nghiệm và hiểu Docker.',
        tags: ['React', 'NestJS'],
      },
    });
    jobId = job.id;
  });

  /// Đặt hàng về RUNNING như thể một tiến trình khác đang chấm.
  const markRunning = async () => {
    await harness.prisma.jobMatch.upsert({
      where: { userId_jobId: { userId: user.id, jobId } },
      create: { userId: user.id, jobId, status: 'RUNNING' },
      update: { status: 'RUNNING' },
    });
  };

  /// Lùi `updatedAt` về quá khứ bằng SQL thô.
  ///
  /// Không đặt được qua Prisma vì trường này khai `@updatedAt`, Prisma luôn ghi
  /// đè bằng thời điểm hiện tại.
  const backdateRunning = async (minutes: number) => {
    await harness.prisma.$executeRawUnsafe(
      `UPDATE "job_matches" SET "updatedAt" = now() - ($3 || ' minutes')::interval
        WHERE "userId" = $1 AND "jobId" = $2`,
      user.id,
      jobId,
      String(minutes),
    );
  };

  test('lần chấm đầu gọi model và lưu kết quả có trọng số', async () => {
    harness.ai.willReturn(evaluation());

    const match = await matching.evaluate(user.id, jobId);

    expect(harness.ai.calls).toHaveLength(1);
    expect(harness.ai.calls[0].purpose).toBe('match.evaluate');
    expect(match.status).toBe('DONE');
    // Điểm tổng do server tính, không lấy từ model.
    expect(match.overallScore).toBe(77);
    expect(match.verdict).toBe('STRONG');
  });

  /// Đây là cơ chế giữ chi phí AI ở mức tối thiểu: mở dashboard bao nhiêu lần
  /// cũng không tốn thêm một lời gọi nào.
  test('lần chấm thứ hai với cùng dữ liệu trả cache, không gọi model', async () => {
    harness.ai.willReturn(evaluation());
    await matching.evaluate(user.id, jobId);

    const again = await matching.evaluate(user.id, jobId);

    expect(harness.ai.calls).toHaveLength(1);
    expect(again.status).toBe('DONE');
  });

  test('force bỏ qua cache và chấm lại', async () => {
    harness.ai.willReturn(evaluation(), evaluation());
    await matching.evaluate(user.id, jobId);

    await matching.evaluate(user.id, jobId, true);

    expect(harness.ai.calls).toHaveLength(2);
  });

  test('hồ sơ đổi thì hash đổi và chấm lại', async () => {
    harness.ai.willReturn(evaluation(), evaluation());
    await matching.evaluate(user.id, jobId);

    await harness.prisma.profile.update({
      where: { userId: user.id },
      data: { headline: 'Fullstack Developer với React và NestJS' },
    });
    await matching.evaluate(user.id, jobId);

    expect(harness.ai.calls).toHaveLength(2);
  });

  describe('giành quyền chấm', () => {
    /// Nếu thiếu bước này, hai worker cùng chấm một cặp sẽ gọi model hai lần và
    /// cùng ghi vào một hàng - kết quả cuối phụ thuộc ai xong sau.
    test('không chấm khi một tiến trình khác đang chấm', async () => {
      await markRunning();
      harness.ai.willReturn(evaluation());

      const match = await matching.evaluate(user.id, jobId);

      expect(harness.ai.calls).toHaveLength(0);
      expect(match.status).toBe('RUNNING');
      // Kết quả xếp sẵn không được dùng: chứng tỏ đã dừng trước khi gọi model.
      expect(harness.ai.pending).toBe(1);
    });

    /// Cửa thoát cho hàng bị bỏ rơi. Không có nó, một tiến trình chết giữa đường
    /// sẽ khoá cặp (user, job) đó lại mãi mãi.
    test('chấm lại được khi hàng đã RUNNING quá lâu', async () => {
      await markRunning();
      await backdateRunning(10);
      harness.ai.willReturn(evaluation());

      const match = await matching.evaluate(user.id, jobId);

      expect(harness.ai.calls).toHaveLength(1);
      expect(match.status).toBe('DONE');
    });

    test('vẫn bị chặn khi hàng RUNNING chưa quá hạn', async () => {
      await markRunning();
      await backdateRunning(2);
      harness.ai.willReturn(evaluation());

      const match = await matching.evaluate(user.id, jobId);

      expect(harness.ai.calls).toHaveLength(0);
      expect(match.status).toBe('RUNNING');
    });

    /// Hai lượt chấm chạy đồng thời trên cùng một cặp: đúng MỘT lượt được gọi
    /// model. Đây là tình huống mà mẫu đọc-rồi-ghi cũ không chặn được.
    ///
    /// Khẳng định duy nhất đáng ghim là số lời gọi model. Bản đầu của test này còn
    /// đòi lượt bị chặn phải trả về RUNNING, và nó đỏ - vì lượt đó đọc lại hàng
    /// SAU khi lượt kia đã xong, nên thấy DONE. Đó là một giả định về thời điểm,
    /// không phải hợp đồng: cả hai kết quả đều đúng, miễn là không có lượt thứ hai
    /// gọi model và không lượt nào ném lỗi.
    test('hai lượt song song chỉ gọi model một lần', async () => {
      harness.ai.willReturn(evaluation());

      const [first, second] = await Promise.all([
        matching.evaluate(user.id, jobId),
        matching.evaluate(user.id, jobId),
      ]);

      expect(harness.ai.calls).toHaveLength(1);
      // Không lượt nào hỏng, và không lượt nào dùng thêm kết quả xếp sẵn.
      expect(harness.ai.pending).toBe(0);
      for (const status of [first.status, second.status]) {
        expect(['RUNNING', 'DONE']).toContain(status);
      }

      const stored = await harness.prisma.jobMatch.findUniqueOrThrow({
        where: { userId_jobId: { userId: user.id, jobId } },
      });
      expect(stored.status).toBe('DONE');
    });
  });

  test('model hỏng thì lưu FAILED kèm thông báo, không ném ra ngoài', async () => {
    harness.ai.willFail(new Error('gateway hết giờ'));

    const match = await matching.evaluate(user.id, jobId);

    expect(match.status).toBe('FAILED');
    expect(match.error).toContain('gateway hết giờ');
  });

  /// Eligibility FAIL là bộ lọc cứng: điểm 0 và verdict POOR, nhưng bản ghi vẫn
  /// được lưu để giao diện giải thích được vì sao công việc bị loại.
  test('eligibility FAIL cho điểm 0 và verdict POOR', async () => {
    harness.ai.willReturn({
      ...evaluation(),
      eligibility: {
        verdict: 'FAIL',
        quote: 'Chỉ nhận ứng viên có quốc tịch Nhật Bản.',
        note: 'Tin đòi quốc tịch Nhật mà hồ sơ không đáp ứng.',
      },
    });

    const match = await matching.evaluate(user.id, jobId);

    expect(match.overallScore).toBe(0);
    expect(match.verdict).toBe('POOR');
    expect(match.eligibilityQuote).toContain('quốc tịch Nhật Bản');
  });
});
