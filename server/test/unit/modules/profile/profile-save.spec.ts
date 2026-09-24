import { ProfileService } from 'src/modules/profile/profile.service.js';
import { QUEUE } from 'src/modules/queue/queue.service.js';
import type { QueueService } from 'src/modules/queue/queue.service.js';
import type { PrismaService } from 'src/prisma/prisma.service.js';

const FULL = {
  headline: 'Kế toán tổng hợp | 5 năm kinh nghiệm',
  location: 'Hà Nội',
  country: 'Việt Nam',
  citizenship: 'Việt Nam',
  summary: 'Kế toán tổng hợp, mạnh về thuế và báo cáo tài chính.',
  primarySkills: ['Misa', 'Excel', 'Thuế'],
  secondarySkills: ['SAP'],
  experiences: [{ position: 'Kế toán', company: 'ABC' }],
  educations: [{ degree: 'Cử nhân', institution: 'NEU' }],
  careerGoals: ['Lên kế toán trưởng'],
  directExperienceDomains: ['Sản xuất'],
  energizingTasks: ['Lập báo cáo'],
  targetSectors: ['Sản xuất'],
};

const build = () => {
  const updates: Array<Record<string, unknown>> = [];
  const send = jest.fn<Promise<string | null>, [string, object]>(() =>
    Promise.resolve('job-1'),
  );

  const prisma = {
    profile: {
      upsert: (args: { create: Record<string, unknown> }) =>
        Promise.resolve({ userId: 'u1', ...FULL, ...args.create }),
      update: (args: { data: Record<string, unknown> }) => {
        updates.push(args.data);
        return Promise.resolve({ userId: 'u1', ...args.data });
      },
    },
  } as unknown as PrismaService;

  return {
    service: new ProfileService(prisma, { send } as unknown as QueueService),
    updates,
    send,
  };
};

describe('ProfileService.save — ba việc đi liền lần ghi', () => {
  it('tính lại completion sau khi lưu', async () => {
    const { service, updates } = build();

    await service.save('u1', { headline: 'Kế toán' });

    expect(updates[0].completion).toBeGreaterThan(0);
  });

  it('tính lại occupationCode sau khi lưu', async () => {
    const { service, updates } = build();

    await service.save('u1', { headline: 'Kế toán tổng hợp' });

    expect(updates[0]).toHaveProperty('occupationCode');
  });

  it('xếp lượt chuẩn hoá kỹ năng', async () => {
    const { service, send } = build();

    await service.save('u1', { primarySkills: ['Misa'] });

    expect(send).toHaveBeenCalledWith(QUEUE.SKILL_CANONICALIZE, {
      userId: 'u1',
    });
  });

  it('update() đi qua đúng save(), không tự viết lại ba việc đó', async () => {
    const { service, updates, send } = build();

    await service.update('u1', { headline: 'Kế toán' });

    expect(updates[0]).toHaveProperty('completion');
    expect(updates[0]).toHaveProperty('occupationCode');
    expect(send).toHaveBeenCalledTimes(1);
  });
});
