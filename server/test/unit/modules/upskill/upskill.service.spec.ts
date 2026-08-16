/*
 * `UpskillService` nạp `AiService` để lấy token DI, mà `AiService` nạp `ai` và
 * `@ai-sdk/openai-compatible` — hai package ESM thuần jest không `require()`
 * được. Test này không chạm tới chúng (nó dùng `FakeAi`), nên chặn ngay ở tầng
 * module bằng factory. KHÔNG dùng `jest.spyOn`: export của module ESM không cấu
 * hình lại được — lý do đầy đủ trong docblock của `ai.service.spec.ts`.
 */
jest.mock('ai', () => ({}));
jest.mock('@ai-sdk/openai-compatible', () => ({}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Profile } from 'src/generated/prisma/client.js';
import type { PrismaService } from 'src/prisma/prisma.service.js';
import type { AiService } from 'src/modules/ai/ai.service.js';
import { PromptBuilderService } from 'src/modules/skills/prompt-builder.service.js';
import type { SkillRegistryService } from 'src/modules/skills/skill-registry.service.js';
import { UpskillService } from 'src/modules/upskill/upskill.service.js';
import { FakeAi } from 'src/testing/fake-ai.js';

/*
 * Vì sao file này tồn tại.
 *
 * Bản một-lời-gọi của báo cáo upskill CHƯA TỪNG tạo nổi một bản ở chế độ
 * AGGREGATE: nhồi 30 công việc vào một prompt rồi đòi model sinh cả bốn trường
 * thì `deepseek-v4-flash-free` hết giờ ở mốc 240s, còn `mimo-v2.5-free` viết
 * xong sau 28s nhưng đánh rơi một dấu `{`. Bản sửa là tách làm hai lời gọi.
 *
 * Điều đáng ghim không phải "có gọi model" mà là **ranh giới giữa hai lời gọi**:
 * lời gọi 2 phải KHÔNG mang theo mô tả công việc. Đó chính là chỗ prompt nhỏ đi,
 * và cũng là thứ dễ mất nhất — thêm một dòng `...jobLines` vào prompt thứ hai là
 * quay về đúng bản đã hỏng, mà không test nào khác đỏ.
 */

/** File skill THẬT, không phải bản giả: xem docblock của test "khung phân tích". */
const SKILL_BODY = readFileSync(
  join(__dirname, '../../../../../.claude/skills/upskill/SKILL.md'),
  'utf8',
);

const MOTA = 'MOTA_DAC_TRUNG_CHI_CO_TRONG_TIN_TUYEN_DUNG';

const GAPS = {
  // Cố ý để ưu tiên THẤP đứng trước, xem test sắp xếp bên dưới.
  hardGaps: [
    {
      skill: 'Terraform',
      demandCount: 1,
      priority: 30,
      evidence: 'Một tin yêu cầu hạ tầng dạng mã.',
    },
    {
      skill: 'Kubernetes',
      demandCount: 4,
      priority: 90,
      evidence: 'Bốn tin yêu cầu vận hành cụm container.',
    },
  ],
  synthesisedGaps: [
    {
      category: 'domain' as const,
      gap: 'Chưa có kinh nghiệm ngành tài chính.',
      why: 'Phần lớn vị trí đang nhắm tới nằm ở ngân hàng số.',
    },
  ],
};

const PLAN = {
  learningPlan: [
    {
      order: 1,
      topic: 'Kubernetes',
      rationale: 'Mở khóa được các chủ đề hạ tầng còn lại.',
      estimatedWeeks: 6,
      resources: ['Sách The Kubernetes Book của Nigel Poulton'],
    },
  ],
  summary: 'Khoảng trống lớn nhất là Kubernetes, nên bắt đầu từ đó.',
};

const profileOf = (overrides: Partial<Profile>): Profile =>
  ({
    primarySkills: [],
    secondarySkills: [],
    lackingSkills: [],
    directExperienceDomains: [],
    adjacentExperience: [],
    careerGoals: [],
    energizingTasks: [],
    drainingTasks: [],
    targetSectors: [],
    dealBreakers: [],
    languages: [],
    willingToRelocate: false,
    ...overrides,
  }) as Profile;

const matchOf = (title: string, score: number) => ({
  overallScore: score,
  gaps: [],
  job: {
    title,
    company: 'Công ty A',
    tags: ['devops'],
    description: MOTA,
  },
});

type UpdateCall = { where: { id: string }; data: Record<string, unknown> };

/** Dựng service với prisma và skill registry giả, AI thì dùng `FakeAi` thật. */
function build(options: {
  mode?: 'AGGREGATE' | 'TARGETED';
  profile?: Profile | null;
  matches?: ReturnType<typeof matchOf>[];
}) {
  const report = {
    id: 'report-1',
    userId: 'user-1',
    mode: options.mode ?? 'AGGREGATE',
    jobId: options.mode === 'TARGETED' ? 'job-1' : null,
  };
  const matches = options.matches ?? [
    matchOf('DevOps Engineer', 40),
    matchOf('SRE', 55),
    matchOf('Platform Engineer', 70),
  ];

  const updates: UpdateCall[] = [];
  const prisma = {
    upskillReport: {
      findUnique: () => Promise.resolve(report),
      update: (call: UpdateCall) => {
        updates.push(call);
        return Promise.resolve({ ...report, ...call.data });
      },
    },
    profile: {
      findUnique: () => Promise.resolve(options.profile ?? null),
    },
    jobMatch: {
      findMany: () => Promise.resolve(matches),
      findUnique: () => Promise.resolve(matches[0]),
    },
  } as unknown as PrismaService;

  const skills = {
    get: () => ({ body: SKILL_BODY }),
  } as unknown as SkillRegistryService;

  const ai = new FakeAi();
  const service = new UpskillService(
    prisma,
    // `FakeAi` cài đặt seam `Ai` (chỉ `generateObject`), còn constructor khai
    // nguyên `AiService` để Nest suy ra token DI — giống 5 service còn lại.
    ai as unknown as AiService,
    skills,
    new PromptBuilderService(),
  );

  /** Lần ghi cuối cùng — lần đặt trạng thái kết thúc. */
  const finalUpdate = () => updates[updates.length - 1].data;

  return { service, ai, updates, finalUpdate };
}

describe('UpskillService.generate - tách làm hai lời gọi', () => {
  test('một báo cáo dùng HAI lời gọi model, đúng thứ tự khoảng trống rồi lộ trình', async () => {
    const { service, ai } = build({});
    ai.willReturn(GAPS, PLAN);

    await service.generate('report-1');

    expect(ai.calls.map((call) => call.purpose)).toEqual([
      'upskill.gaps',
      'upskill.plan',
    ]);
    expect(ai.pending).toBe(0);
  });

  test('chế độ TARGETED cũng tách, không có nhánh riêng nào chạy bản một-lời-gọi', async () => {
    const { service, ai } = build({ mode: 'TARGETED' });
    ai.willReturn(GAPS, PLAN);

    await service.generate('report-1');

    expect(ai.calls).toHaveLength(2);
  });

  test('lời gọi 2 KHÔNG mang theo mô tả công việc — đây là lý do của cả bản sửa', async () => {
    const { service, ai } = build({});
    ai.willReturn(GAPS, PLAN);

    await service.generate('report-1');

    const [gapsCall, planCall] = ai.calls;
    expect(gapsCall.prompt).toContain(MOTA);
    expect(planCall.prompt).not.toContain(MOTA);
    expect(planCall.prompt).not.toContain('DevOps Engineer');
  });

  test('lời gọi 2 nhận đúng khoảng trống mà lời gọi 1 trả về', async () => {
    const { service, ai } = build({});
    ai.willReturn(GAPS, PLAN);

    await service.generate('report-1');

    const planPrompt = ai.calls[1].prompt;
    expect(planPrompt).toContain('Kubernetes');
    expect(planPrompt).toContain('Terraform');
    expect(planPrompt).toContain('Chưa có kinh nghiệm ngành tài chính.');
  });

  test('khoảng trống vào lời gọi 2 được sắp lại theo ưu tiên giảm dần', async () => {
    // Nhãn "sắp theo độ ưu tiên" trong prompt phải đúng. Model trả về thứ tự nào
    // là chuyện của model; sắp lại là việc của code.
    const { service, ai } = build({});
    ai.willReturn(GAPS, PLAN);

    await service.generate('report-1');

    const planPrompt = ai.calls[1].prompt;
    expect(planPrompt.indexOf('Kubernetes')).toBeLessThan(
      planPrompt.indexOf('Terraform'),
    );
  });

  test('hồ sơ vẫn có mặt ở lời gọi 2, vì lời khuyên học phải bám vào nền sẵn có', async () => {
    const { service, ai } = build({
      profile: profileOf({ primarySkills: ['Docker'] }),
    });
    ai.willReturn(GAPS, PLAN);

    await service.generate('report-1');

    expect(ai.calls[1].prompt).toContain('Docker');
  });

  test('kết quả hai lời gọi được ghép vào một bản ghi DONE', async () => {
    const { service, ai, finalUpdate } = build({});
    ai.willReturn(GAPS, PLAN);

    await service.generate('report-1');

    expect(finalUpdate()).toMatchObject({
      status: 'DONE',
      jobsAnalysed: 3,
      hardGaps: GAPS.hardGaps,
      synthesisedGaps: GAPS.synthesisedGaps,
      learningPlan: PLAN.learningPlan,
      summary: PLAN.summary,
    });
  });

  test('lời gọi 1 hỏng thì KHÔNG gọi tiếp lời gọi 2', async () => {
    // Gọi tiếp là trả tiền cho một lời gọi chắc chắn vô nghĩa: không có khoảng
    // trống thì không có gì để lập lộ trình.
    const { service, ai, finalUpdate } = build({});
    ai.willFail(new Error('hết giờ'));

    await service.generate('report-1');

    expect(ai.calls).toHaveLength(1);
    expect(finalUpdate()).toMatchObject({ status: 'FAILED' });
  });

  test('lời gọi 2 hỏng thì báo cáo FAILED chứ không lưu nửa vời', async () => {
    const { service, ai, finalUpdate } = build({});
    ai.willReturn(GAPS).willFail(new Error('JSON hỏng'));

    await service.generate('report-1');

    const data = finalUpdate();
    expect(data).toMatchObject({ status: 'FAILED' });
    expect(data.hardGaps).toBeUndefined();
  });

  test('AGGREGATE dưới 3 công việc thì dừng trước khi tốn lời gọi nào', async () => {
    const { service, ai, finalUpdate } = build({
      matches: [matchOf('DevOps Engineer', 40), matchOf('SRE', 55)],
    });

    await service.generate('report-1');

    expect(ai.calls).toHaveLength(0);
    expect(finalUpdate()).toMatchObject({ status: 'FAILED' });
  });
});

describe('UpskillService.generate - khung phân tích chia đôi', () => {
  /*
   * Hai test dưới đây đọc file SKILL.md THẬT chứ không dùng bản giả, và đó là
   * chủ đích. `keepSections` khớp theo tiền tố tiêu đề: đổi "## Step 6" thành
   * "## Learning Plan" thì nó trả về chuỗi RỖNG, không ném lỗi, không ghi log.
   * Lời gọi 2 sẽ im lặng mất toàn bộ khung hướng dẫn và vẫn trả về một báo cáo
   * trông bình thường. Chỉ có test đọc file thật mới bắt được chuyện đó.
   */

  test('lời gọi 1 nhận bước tìm khoảng trống, KHÔNG nhận bước lập lộ trình', async () => {
    const { service, ai } = build({});
    ai.willReturn(GAPS, PLAN);

    await service.generate('report-1');

    const system = ai.calls[0].system;
    expect(system).toContain('Step 3');
    expect(system).toContain('Step 4');
    expect(system).toContain('Step 5');
    expect(system).not.toContain('Step 6');
  });

  test('lời gọi 2 nhận bước lập lộ trình, KHÔNG nhận bước đối chiếu kỹ năng', async () => {
    const { service, ai } = build({});
    ai.willReturn(GAPS, PLAN);

    await service.generate('report-1');

    const system = ai.calls[1].system;
    expect(system).toContain('Step 6');
    expect(system).toContain('Step 7');
    expect(system).not.toContain('Step 3');
  });
});
