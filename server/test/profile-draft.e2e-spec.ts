import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { QUEUE } from 'src/modules/queue/queue.service.js';
import { MIN_COMPLETION_TO_SCORE } from 'src/modules/scraper/fan-out.js';
import type { ProfileProposal } from 'src/modules/profile-sources/profile-proposal.schema.js';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from './support/app-harness.js';

/**
 * Đọc CV thành ĐỀ XUẤT hồ sơ — Agent 1 của đề tài.
 *
 * Chạy trên PDF thật (`test/fixtures/`), qua HTTP thật, với FakeAi. Nhờ FakeAi mà
 * cả đường này kiểm được **không cần gateway** — đúng thứ SEAM 1 của Pha 0 được
 * dựng ra để làm, và hôm nay nó có giá trị rất cụ thể: hạn mức gateway free đã cạn.
 *
 * Điều KHÔNG kiểm được ở đây, và cần nói rõ: **chất lượng đọc của model thật**.
 * FakeAi trả về dữ liệu tôi xếp sẵn, nên spec này chứng minh đường dẫn đúng, chứ
 * không chứng minh model đọc CV giỏi.
 */
const fixture = (name: string): Buffer =>
  readFileSync(join(__dirname, 'fixtures', name));

const CV = 'cv-tieng-viet.pdf';
const SCAN = 'cv-scan-khong-co-text.pdf';

/// Đề xuất mẫu. `FakeAi` chạy `schema.parse` lên giá trị này, nên nếu nó không
/// khớp `profileProposalSchema` thì test đỏ ngay — không thể xếp một hình dạng mà
/// model thật không trả được.
const proposal: ProfileProposal = {
  headline: 'Kỹ sư Backend 5 năm kinh nghiệm',
  location: 'Hà Nội',
  country: 'Việt Nam',
  summary: 'Kỹ sư backend, mạnh về NestJS và PostgreSQL.',
  languages: ['Tiếng Việt (bản ngữ)', 'Tiếng Anh (IELTS 6.5)'],
  primarySkills: ['TypeScript', 'NestJS', 'PostgreSQL'],
  secondarySkills: ['React', 'Kubernetes'],
  directExperienceDomains: ['thương mại điện tử'],
  adjacentExperience: ['fintech'],
  experiences: [
    {
      company: 'Công ty Cổ phần Digistore',
      position: 'Senior Backend Engineer',
      period: '03/2022 – nay',
      location: 'Hà Nội',
      highlights: ['Giảm tỉ lệ giao dịch lỗi từ 4,1% xuống 0,8%.'],
    },
  ],
  educations: [
    {
      school: 'Đại học Bách khoa Hà Nội',
      degree: 'Cử nhân',
      field: 'Kỹ thuật Máy tính',
      period: '2015 – 2019',
      gpa: '3,2/4,0',
    },
  ],
  certificates: [
    { name: 'AWS Certified Solutions Architect – Associate', year: '2023' },
  ],
  projects: [
    {
      name: 'Trợ lý tìm việc AI',
      description:
        'Hệ thống đa agent chấm độ phù hợp hồ sơ với tin tuyển dụng.',
      technologies: ['NestJS', 'Prisma'],
    },
  ],
  missing: ['Định hướng nghề nghiệp', 'Tình trạng giấy phép lao động'],
  notes: ['CV không ghi mức lương mong muốn.'],
};

const uploadCv = (harness: TestApp, user: TestUser, name = CV) =>
  request(harness.server)
    .post('/api/profile-drafts/cv')
    .set('Authorization', `Bearer ${user.token}`)
    .attach('file', fixture(name), {
      filename: name,
      contentType: 'application/pdf',
    });

/// Nộp CV rồi trả về draftId đã có kiểu.
///
/// Có hàm riêng vì `response.body` của supertest là `any`: viết
/// `const { body } = await uploadCv(...)` là phá luật no-unsafe-assignment, và
/// tắt luật đó đi thì mất luôn phép bảo vệ ở những chỗ nó thật sự cần.
const uploadAndGetId = async (
  harness: TestApp,
  user: TestUser,
  name = CV,
): Promise<string> => {
  const response = await uploadCv(harness, user, name).expect(201);
  return (response.body as { draftId: string }).draftId;
};

describe('Đọc CV thành đề xuất hồ sơ', () => {
  let harness: TestApp;
  let user: TestUser;

  beforeAll(async () => {
    harness = await createTestApp();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    user = await harness.signUp();
  });

  test('nộp CV có lớp text thì tạo bản nháp và xếp việc', async () => {
    const response = await uploadCv(harness, user).expect(201);

    const body = response.body as {
      draftId: string;
      queued: boolean;
      extracted: Array<Record<string, unknown>>;
    };
    expect(body.queued).toBe(true);
    expect(typeof body.draftId).toBe('string');

    // Số liệu trích xuất trả về NGAY trong response: người dùng biết hệ thống đọc
    // được bao nhiêu chữ trước khi model chạy xong.
    expect(body.extracted).toHaveLength(1);
    expect(body.extracted[0].pages).toBe(1);
    expect(Number(body.extracted[0].chars)).toBeGreaterThan(500);

    expect(harness.queue.sentTo(QUEUE.PROFILE_SYNTHESIZE)).toHaveLength(1);
  });

  test('lượt đọc chạy xong thì lưu đề xuất, KHÔNG ghi vào hồ sơ', async () => {
    harness.ai.willReturn(proposal);
    const draftId = await uploadAndGetId(harness, user);

    await harness.queue.drain();

    const draft = await request(harness.server)
      .get(`/api/profile-drafts/${draftId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    const record = draft.body as {
      status: string;
      proposal: ProfileProposal;
      appliedAt: string | null;
    };
    expect(record.status).toBe('DONE');
    expect(record.proposal.primarySkills).toContain('NestJS');
    expect(record.appliedAt).toBeNull();

    // Phép khẳng định QUAN TRỌNG NHẤT của cả spec: hồ sơ thật vẫn trống. Đây là
    // ranh giới "AI đề xuất, người dùng chốt", và nếu nó hỏng thì một lần đọc sai
    // đã ghi đè dữ liệu người dùng tự gõ mà không ai đồng ý.
    const profile = await harness.prisma.profile.findUnique({
      where: { userId: user.id },
    });
    expect(profile?.primarySkills ?? []).toEqual([]);
    expect(profile?.headline ?? null).toBeNull();
  });

  test('chỉ những trường được tích mới ghi vào hồ sơ', async () => {
    harness.ai.willReturn(proposal);
    const draftId = await uploadAndGetId(harness, user);
    await harness.queue.drain();

    await request(harness.server)
      .put(`/api/profile-drafts/${draftId}/apply`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ fields: ['primarySkills', 'headline'] })
      .expect(200);

    const profile = await harness.prisma.profile.findUnique({
      where: { userId: user.id },
    });

    expect(profile?.primarySkills).toEqual([
      'TypeScript',
      'NestJS',
      'PostgreSQL',
    ]);
    expect(profile?.headline).toBe('Kỹ sư Backend 5 năm kinh nghiệm');
    // KHÔNG được tích nên KHÔNG được ghi, dù đề xuất có giá trị cho nó.
    expect(profile?.summary ?? null).toBeNull();
    expect(profile?.secondarySkills ?? []).toEqual([]);
  });

  test('áp dụng CV vào hồ sơ TRỐNG thì tính lại completion', async () => {
    harness.ai.willReturn(proposal);
    const draftId = await uploadAndGetId(harness, user);
    await harness.queue.drain();

    // Đúng bộ trường mà `defaultSelection` tích sẵn cho một hồ sơ trống: không có
    // gì để ghi đè nên mọi đề xuất đều được chọn.
    await request(harness.server)
      .put(`/api/profile-drafts/${draftId}/apply`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        fields: [
          'headline',
          'location',
          'country',
          'summary',
          'primarySkills',
          'secondarySkills',
          'directExperienceDomains',
          'experiences',
          'educations',
        ],
      })
      .expect(200);

    const profile = await harness.prisma.profile.findUnique({
      where: { userId: user.id },
    });

    // Đây là đường tạo hồ sơ bằng `create`, nơi `completion` từng giữ nguyên mặc
    // định 0. Dưới MIN_COMPLETION_TO_SCORE thì `fanOut` bỏ qua người này, nên họ
    // không bao giờ nhận được một match nào mà cũng không thấy lỗi gì.
    expect(profile?.completion ?? 0).toBeGreaterThanOrEqual(
      MIN_COMPLETION_TO_SCORE,
    );
  });

  test('không ghi được những trường model bị cấm đề xuất', async () => {
    harness.ai.willReturn(proposal);
    const draftId = await uploadAndGetId(harness, user);
    await harness.queue.drain();

    // Gửi lên đúng những tên trường mà `profile-proposal.schema.ts` cấm model
    // đoán. Danh sách trắng phải chặn hết, nếu không thì một suy đoán sai về giấy
    // phép lao động sẽ đi thẳng vào Eligibility Gate — bộ lọc CỨNG.
    await request(harness.server)
      .put(`/api/profile-drafts/${draftId}/apply`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        fields: ['citizenship', 'workPermit', 'careerGoals', 'primarySkills'],
      })
      .expect(200);

    const profile = await harness.prisma.profile.findUnique({
      where: { userId: user.id },
    });
    expect(profile?.citizenship ?? null).toBeNull();
    expect(profile?.workPermit ?? null).toBeNull();
    expect(profile?.careerGoals ?? []).toEqual([]);
    // Trường hợp lệ trong cùng request vẫn phải được ghi.
    expect(profile?.primarySkills).toContain('NestJS');
  });

  test('PDF scan bị từ chối NGAY tại request, kèm lý do đọc được', async () => {
    const response = await uploadCv(harness, user, SCAN).expect(400);

    const message = (response.body as { message: string }).message;
    expect(message).toMatch(/bản scan|ảnh chụp/i);
    // Không lộ tên lớp lỗi ra cho người dùng.
    expect(message).not.toMatch(/ScannedPdfError|Error/);

    // Và KHÔNG để lại bản nháp rác: từ chối ở request nghĩa là không có bản ghi
    // FAILED nào để người dùng phải tự hiểu.
    const drafts = await harness.prisma.profileDraft.count({
      where: { userId: user.id },
    });
    expect(drafts).toBe(0);
    expect(harness.queue.sentTo(QUEUE.PROFILE_SYNTHESIZE)).toHaveLength(0);
  });

  test('file không phải PDF bị từ chối', async () => {
    const response = await request(harness.server)
      .post('/api/profile-drafts/cv')
      .set('Authorization', `Bearer ${user.token}`)
      .attach('file', Buffer.from('không phải PDF'), {
        filename: 'cv.pdf',
        contentType: 'application/pdf',
      })
      .expect(400);

    expect((response.body as { message: string }).message).toMatch(
      /không phải PDF|hỏng/i,
    );
  });

  test('không nộp file thì báo rõ, không nổ 500', async () => {
    const response = await request(harness.server)
      .post('/api/profile-drafts/cv')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(400);

    expect((response.body as { message: string }).message).toMatch(/file/i);
  });

  test('model hỏng thì bản nháp FAILED và hồ sơ vẫn nguyên', async () => {
    harness.ai.willFail(new Error('gateway hết giờ'));
    const draftId = await uploadAndGetId(harness, user);

    await harness.queue.drain();

    const draft = await request(harness.server)
      .get(`/api/profile-drafts/${draftId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    const record = draft.body as { status: string; failureKind: string | null };
    expect(record.status).toBe('FAILED');
    // Trả phân loại, KHÔNG trả nguyên văn thông báo của SDK.
    expect(record).not.toHaveProperty('error');
    expect(record.failureKind).toBeTruthy();
  });

  test('áp dụng một bản nháp chưa xong thì bị từ chối', async () => {
    const draftId = await uploadAndGetId(harness, user);
    // KHÔNG drain: bản nháp còn PENDING.

    const response = await request(harness.server)
      .put(`/api/profile-drafts/${draftId}/apply`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ fields: ['primarySkills'] })
      .expect(400);

    expect((response.body as { message: string }).message).toMatch(/PENDING/);
  });

  test('mảng fields rỗng bị từ chối chứ không lặng lẽ đánh dấu đã áp dụng', async () => {
    harness.ai.willReturn(proposal);
    const draftId = await uploadAndGetId(harness, user);
    await harness.queue.drain();

    await request(harness.server)
      .put(`/api/profile-drafts/${draftId}/apply`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ fields: [] })
      .expect(400);

    const draft = await harness.prisma.profileDraft.findUnique({
      where: { id: draftId },
    });
    expect(draft?.appliedAt).toBeNull();
  });

  test('không đọc được bản nháp của người khác', async () => {
    harness.ai.willReturn(proposal);
    const draftId = await uploadAndGetId(harness, user);

    const other = await harness.signUp();

    await request(harness.server)
      .get(`/api/profile-drafts/${draftId}`)
      .set('Authorization', `Bearer ${other.token}`)
      .expect(404);

    await request(harness.server)
      .put(`/api/profile-drafts/${draftId}/apply`)
      .set('Authorization', `Bearer ${other.token}`)
      .send({ fields: ['primarySkills'] })
      .expect(404);
  });

  test('không đăng nhập thì không nộp được', async () => {
    await request(harness.server)
      .post('/api/profile-drafts/cv')
      .attach('file', fixture(CV), {
        filename: CV,
        contentType: 'application/pdf',
      })
      .expect(401);
  });
});
