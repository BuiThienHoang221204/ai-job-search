import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ProfileDraft } from 'src/generated/prisma/client.js';
import type { CvPdfSource } from 'src/modules/profile-sources/cv-pdf.source.js';
import type { ProfileService } from 'src/modules/profile/profile.service.js';
import { ProfileDraftService } from 'src/modules/profile-sources/services/profile-draft.service.js';
import { QUEUE } from 'src/modules/queue/queue.service.js';
import type { QueueService } from 'src/modules/queue/queue.service.js';
import type { Storage } from 'src/modules/storage/storage.interface.js';
import type { PrismaService } from 'src/prisma/prisma.service.js';

/*
 * `retry()` có mặt vì trên tier free, bản nháp FAILED là chuyện thường ngày.
 * Ba ràng buộc dưới đây đều là thứ hỏng mà KHÔNG gây lỗi: quên kiểm chủ sở hữu
 * thì người này chạy lại được bản nháp của người kia, quên kiểm trạng thái thì
 * một cú bấm nhân đôi lượt gọi model đang chạy, còn quên kiểm bằng chứng thì
 * mỗi lần bấm lại đốt một lượt để nhận đúng lỗi cũ.
 */

const EVIDENCE = [
  {
    kind: 'CV_PDF_TEXT',
    label: 'cv.pdf',
    text: 'Kế toán tổng hợp, 3 năm kinh nghiệm.',
    meta: { chars: 36 },
  },
];

const draft = (over: Partial<ProfileDraft> = {}): ProfileDraft =>
  ({
    id: 'draft-1',
    userId: 'user-1',
    status: 'FAILED',
    evidence: EVIDENCE,
    error: 'Rate limit exceeded',
    ...over,
  }) as unknown as ProfileDraft;

function build(found: ProfileDraft | null) {
  const updateMany = jest.fn<Promise<{ count: number }>, [unknown]>(() =>
    Promise.resolve({ count: 1 }),
  );
  const findFirst = jest
    .fn<Promise<ProfileDraft | null>, [unknown]>()
    .mockResolvedValueOnce(found)
    .mockResolvedValue(draft({ status: 'PENDING', error: null }));
  const send = jest.fn<Promise<string | null>, [string, object]>(() =>
    Promise.resolve('job-1'),
  );

  const prisma = {
    profileDraft: { findFirst, updateMany },
  } as unknown as PrismaService;

  const service = new ProfileDraftService(
    prisma,
    { send } as unknown as QueueService,
    {} as unknown as CvPdfSource,
    {} as unknown as ProfileService,
    {} as unknown as Storage,
  );

  return { service, updateMany, send };
}

describe('ProfileDraftService.retry', () => {
  test('bản nháp của người khác thì coi như không tồn tại', async () => {
    const { service, send } = build(null);

    await expect(service.retry('user-2', 'draft-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(send).not.toHaveBeenCalled();
  });

  test('chỉ chạy lại được bản FAILED', async () => {
    for (const status of ['PENDING', 'RUNNING', 'DONE'] as const) {
      const { service, send } = build(draft({ status }));

      await expect(service.retry('user-1', 'draft-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(send).not.toHaveBeenCalled();
    }
  });

  test('FAILED có bằng chứng: về PENDING, xoá lỗi cũ, xếp đúng payload', async () => {
    const { service, updateMany, send } = build(draft());

    const result = await service.retry('user-1', 'draft-1');

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'draft-1', userId: 'user-1', status: 'FAILED' },
      data: { status: 'PENDING', error: null },
    });
    expect(send).toHaveBeenCalledWith(QUEUE.PROFILE_SYNTHESIZE, {
      userId: 'user-1',
      draftId: 'draft-1',
    });
    expect(result.status).toBe('PENDING');
  });
});
