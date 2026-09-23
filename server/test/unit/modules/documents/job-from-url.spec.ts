import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JobFromUrlService } from 'src/modules/documents/services/job-from-url.service.js';
import type { AiService } from 'src/modules/ai/services/ai.service.js';
import * as httpGet from 'src/common/web/http-get.js';

jest.mock('src/common/web/http-get.js', () => ({
  fetchPage: jest.fn(),
  HttpGetError: class extends Error {},
}));

const fetchPage = httpGet.fetchPage as jest.MockedFunction<
  typeof httpGet.fetchPage
>;

const body = (text: string) => `<html><body><p>${text}</p></body></html>`;

const LONG_POSTING = body(
  'Tuyển kế toán tổng hợp tại Hà Nội. '.repeat(40) +
    'Yêu cầu ba năm kinh nghiệm, thành thạo Misa và Excel. '.repeat(20),
);

const build = (
  object = { company: 'Vinamilk', title: 'Kế toán', description: 'Mô tả' },
) => {
  const generateObject = jest.fn<
    Promise<{ object: typeof object; modelId: string }>,
    [{ prompt: string; context: { purpose: string } }]
  >(() => Promise.resolve({ object, modelId: 'm1' }));

  const service = new JobFromUrlService(
    { generateObject } as unknown as AiService,
    {
      get: () => ({
        fetchTimeoutMs: 1000,
        fetchMaxBytes: 1000,
        search: { apiKey: '', url: '', maxResults: 5 },
      }),
    } as unknown as ConfigService,
  );

  return { service, generateObject };
};

beforeEach(() => fetchPage.mockReset());

describe('JobFromUrlService.extract', () => {
  it('bóc được tin thì trả về ba trường', async () => {
    fetchPage.mockResolvedValue({
      url: 'https://x.test/tin',
      status: 200,
      body: LONG_POSTING,
    });
    const { service } = build();

    await expect(service.extract('u1', 'https://x.test/tin')).resolves.toEqual({
      company: 'Vinamilk',
      title: 'Kế toán',
      description: 'Mô tả',
    });
  });

  it('portal chặn máy chủ thì chỉ đường dán chữ, không gọi model', async () => {
    fetchPage.mockResolvedValue({ url: 'x', status: 403, body: '' });
    const { service, generateObject } = build();

    await expect(service.extract('u1', 'https://x.test')).rejects.toThrow(
      /chặn truy cập.*dán vào ô mô tả công việc/s,
    );
    expect(generateObject).not.toHaveBeenCalled();
  });

  it('429 cũng là chặn, không phải hỏng', async () => {
    fetchPage.mockResolvedValue({ url: 'x', status: 429, body: '' });

    await expect(
      build().service.extract('u1', 'https://x.test'),
    ).rejects.toThrow(/chặn truy cập/);
  });

  it('trang render phía trình duyệt thì nói rõ, không gọi model', async () => {
    fetchPage.mockResolvedValue({ url: 'x', status: 200, body: body('ngắn') });
    const { service, generateObject } = build();

    await expect(service.extract('u1', 'https://x.test')).rejects.toThrow(
      /render phía trình duyệt/,
    );
    expect(generateObject).not.toHaveBeenCalled();
  });

  it('tải hỏng thì câu lỗi vẫn chỉ đường dán chữ', async () => {
    fetchPage.mockRejectedValue(new Error('Máy chủ không có lệnh `curl`'));

    await expect(
      build().service.extract('u1', 'https://x.test'),
    ).rejects.toThrow(/curl.*dán vào ô mô tả công việc/s);
  });

  it('model không tìm ra tin nào thì báo lỗi chứ không trả ô rỗng', async () => {
    fetchPage.mockResolvedValue({
      url: 'x',
      status: 200,
      body: LONG_POSTING,
    });
    const { service } = build({ company: '', title: '', description: '' });

    await expect(
      service.extract('u1', 'https://x.test'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('chỉ đưa phần CHỮ vào prompt, không đưa HTML', async () => {
    fetchPage.mockResolvedValue({
      url: 'x',
      status: 200,
      body: LONG_POSTING,
    });
    const { service, generateObject } = build();

    await service.extract('u1', 'https://x.test');

    const call = generateObject.mock.calls[0][0];
    expect(call.prompt).not.toContain('<html>');
    expect(call.prompt).toContain('Tuyển kế toán tổng hợp');
    expect(call.context.purpose).toBe('job.fromUrl');
  });
});
