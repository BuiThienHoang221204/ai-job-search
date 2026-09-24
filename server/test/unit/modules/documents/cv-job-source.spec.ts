import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DocumentsService } from 'src/modules/documents/services/documents.service.js';
import { letterTarget } from 'src/modules/documents/utils/letter-target.js';
import type { DocumentGenerator } from 'src/modules/documents/services/document-generator.service.js';
import type { DocumentRenderer } from 'src/modules/documents/services/document-renderer.service.js';
import type { PrismaService } from 'src/prisma/prisma.service.js';
import type { Job } from 'src/generated/prisma/client.js';

const JD =
  'Chúng tôi tìm kế toán tổng hợp ba năm kinh nghiệm, thành thạo Misa và Excel, làm việc tại Hà Nội.';

const build = (options: { jobExists?: boolean } = {}) => {
  const created: Array<Record<string, unknown>> = [];

  const prisma = {
    job: {
      findUnique: () =>
        Promise.resolve(options.jobExists === false ? null : { id: 'job-1' }),
    },
    document: {
      create: (args: { data: Record<string, unknown> }) => {
        created.push(args.data);
        return Promise.resolve({ id: 'doc-1', ...args.data });
      },
    },
  } as unknown as PrismaService;

  const service = new DocumentsService(
    prisma,
    {} as DocumentGenerator,
    {} as DocumentRenderer,
  );

  return { service, created };
};

describe('DocumentsService.createCv — ba nguồn tin tuyển dụng', () => {
  it('tin đã lưu thì gắn jobId, không nhét gì vào content', async () => {
    const { service, created } = build();

    await service.createCv('u1', { jobId: 'job-1', language: 'VI' });

    expect(created[0].jobId).toBe('job-1');
    expect(created[0].content).toBeUndefined();
  });

  it('tin đã lưu mà không có thật thì 404', async () => {
    const { service } = build({ jobExists: false });

    await expect(
      service.createCv('u1', { jobId: 'khong-co' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('JD dán tay nằm trong content, KHÔNG thành một Job', async () => {
    const { service, created } = build();

    await service.createCv('u1', {
      jobDescription: JD,
      company: 'Vinamilk',
      title: 'Kế toán tổng hợp',
    });

    expect(created[0].jobId).toBeNull();
    expect(created[0].content).toEqual({
      jobDescription: JD,
      company: 'Vinamilk',
      title: 'Kế toán tổng hợp',
    });
  });

  it('không nguồn nào là CV tổng quát, không phải lỗi', async () => {
    const { service, created } = build();

    await service.createCv('u1', { language: 'VI' });

    expect(created[0].jobId).toBeNull();
    expect(created[0].content).toBeUndefined();
  });

  it('dán JD mà thiếu tên công ty thì bị chặn, không tạo bản ghi', async () => {
    const { service, created } = build();

    await expect(
      service.createCv('u1', { jobDescription: JD, title: 'Kế toán' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(created).toHaveLength(0);
  });

  it('có jobId thì JD dán tay bị bỏ qua, tin đã lưu thắng', async () => {
    const { service, created } = build();

    await service.createCv('u1', {
      jobId: 'job-1',
      jobDescription: JD,
      company: 'Vinamilk',
      title: 'Kế toán',
    });

    expect(created[0].jobId).toBe('job-1');
    expect(created[0].content).toBeUndefined();
  });
});

describe('letterTarget — JD dán tay của CV đi vào prompt như tin đã lưu', () => {
  it('dựng đích từ content của tài liệu', () => {
    const target = letterTarget(null, {
      jobDescription: JD,
      company: 'Vinamilk',
      title: 'Kế toán tổng hợp',
    });

    expect(target).toEqual({
      company: 'Vinamilk',
      title: 'Kế toán tổng hợp',
      description: JD,
      jobId: null,
    });
  });

  it('CV tổng quát không có đích nào', () => {
    expect(letterTarget(null, {})).toBeNull();
  });

  it('tin đã lưu vẫn thắng content', () => {
    const job = {
      id: 'job-1',
      company: 'FPT',
      title: 'Lập trình viên',
      description: 'Mô tả của tin đã lưu',
    } as Job;

    expect(letterTarget(job, { company: 'Vinamilk' })?.company).toBe('FPT');
  });
});
