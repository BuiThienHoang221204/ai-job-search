import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from 'src/prisma/prisma.service.js';
import { SalaryService } from 'src/modules/salary/salary.service.js';

const band = (experienceLabel: string) => ({
  experienceLabel,
  minAmount: 1,
  avgAmount: 2,
  maxAmount: 3,
});

function fakePrisma(over: Record<string, unknown> = {}) {
  const where: Array<Record<string, unknown>> = [];
  const prisma = {
    salaryReference: {
      groupBy: jest.fn(() => Promise.resolve([])),
      findMany: jest.fn((args: { where: Record<string, unknown> }) => {
        where.push(args.where);
        return Promise.resolve([]);
      }),
      findFirst: jest.fn((args: { where: Record<string, unknown> }) => {
        where.push(args.where);
        return Promise.resolve(null);
      }),
      ...over,
    },
  } as unknown as PrismaService;

  return { prisma, where };
}

const reference = (over: Record<string, unknown> = {}) => ({
  positionSlug: 'it-software-backend-developer',
  positionName: 'Lập trình viên Backend',
  occupationCode: 'IT',
  sourceUrl: 'https://example.test/x',
  fetchedAt: new Date('2026-08-29'),
  currency: 'VND',
  avgMonthly: 27_300_000,
  rangeMin: 8_000_000,
  rangeMax: 57_000_000,
  bands: [],
  ...over,
});

const peer = (slug: string, avgMonthly: number) => ({
  positionSlug: slug,
  positionName: slug,
  avgMonthly,
});

describe('SalaryService', () => {
  it('chỉ đọc bản ghi PUBLIC - bản INTERNAL không được lọt ra ngoài', async () => {
    const { prisma, where } = fakePrisma();
    await new SalaryService(prisma).positions({});

    expect(where[0]).toMatchObject({ visibility: 'PUBLIC' });
  });

  it('bỏ qua bản ghi chưa xếp được ngành khi không lọc theo ngành', async () => {
    const { prisma, where } = fakePrisma();
    await new SalaryService(prisma).positions({});

    expect(where[0].occupationCode).toEqual({ not: null });
  });

  it('ném NotFound khi vị trí không có dữ liệu công khai', async () => {
    const { prisma } = fakePrisma();

    await expect(
      new SalaryService(prisma).position('khong-ton-tai'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('xếp mốc kinh nghiệm theo thứ tự thời gian chứ không theo bảng chữ cái', async () => {
    const { prisma } = fakePrisma({
      findFirst: jest.fn(() =>
        Promise.resolve({
          positionSlug: 'it-software-backend-developer',
          positionName: 'Lập trình viên Backend',
          occupationCode: 'IT',
          sourceUrl: 'https://example.test/x',
          fetchedAt: new Date('2026-08-29'),
          currency: 'VND',
          avgMonthly: 27_300_000,
          rangeMin: 8_000_000,
          rangeMax: 57_000_000,
          bands: [
            band('Trên 5 năm'),
            band('Dưới 1 năm'),
            band('3–5 năm'),
            band('1–3 năm'),
          ],
        }),
      ),
    });

    const result = await new SalaryService(prisma).position(
      'it-software-backend-developer',
    );

    expect(result.bands.map((b) => b.experienceLabel)).toEqual([
      'Dưới 1 năm',
      '1–3 năm',
      '3–5 năm',
      'Trên 5 năm',
    ]);
  });

  it('báo rõ số đến từ nguồn ngoài và không bịa ra cỡ mẫu', async () => {
    const { prisma } = fakePrisma({
      findFirst: jest.fn(() =>
        Promise.resolve({
          positionSlug: 'marketing-seo-executive',
          positionName: 'Nhân viên SEO',
          occupationCode: 'MARKETING',
          sourceUrl: 'https://example.test/seo',
          fetchedAt: new Date('2026-08-29'),
          currency: 'VND',
          avgMonthly: 15_000_000,
          rangeMin: null,
          rangeMax: null,
          bands: [],
        }),
      ),
    });

    const result = await new SalaryService(prisma).position(
      'marketing-seo-executive',
    );

    expect(result.provider).toBe('x-interview');
    expect(result.providerUrl).toBe('https://example.test/seo');
    expect(result.sampleSize).toBeNull();
  });
});

describe('SalaryService.peers', () => {
  it('giữ vị trí đang xem trong bảng dù nó không lọt top', async () => {
    const rows = [
      peer('a', 40_000_000),
      peer('b', 38_000_000),
      peer('c', 36_000_000),
      peer('d', 34_000_000),
      peer('e', 32_000_000),
      peer('f', 30_000_000),
      peer('g', 28_000_000),
      peer('it-software-backend-developer', 27_300_000),
    ];
    const { prisma } = fakePrisma({
      findFirst: jest.fn(() => Promise.resolve(reference())),
      findMany: jest.fn(() => Promise.resolve(rows)),
    });

    const result = await new SalaryService(prisma).position(
      'it-software-backend-developer',
    );
    const current = result.peers.find((p) => p.isCurrent);

    expect(result.peers).toHaveLength(7);
    expect(current).toBeDefined();
    expect(current?.rank).toBe(8);
  });

  it('đánh số hạng theo TOÀN ngành, không theo vị trí trong bảng đã cắt', async () => {
    const rows = [
      peer('a', 40_000_000),
      peer('it-software-backend-developer', 27_300_000),
    ];
    const { prisma } = fakePrisma({
      findFirst: jest.fn(() => Promise.resolve(reference())),
      findMany: jest.fn(() => Promise.resolve(rows)),
    });

    const result = await new SalaryService(prisma).position(
      'it-software-backend-developer',
    );

    expect(result.peers.map((p) => p.rank)).toEqual([1, 2]);
  });

  it('trả mảng rỗng khi vị trí chưa xếp được ngành', async () => {
    const { prisma } = fakePrisma({
      findFirst: jest.fn(() =>
        Promise.resolve(reference({ occupationCode: null })),
      ),
    });

    const result = await new SalaryService(prisma).position(
      'it-software-backend-developer',
    );

    expect(result.peers).toEqual([]);
  });
});
