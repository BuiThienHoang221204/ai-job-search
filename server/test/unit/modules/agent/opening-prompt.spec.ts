import { buildOpeningPrompt } from 'src/modules/agent/prompts/system-prompt.js';

describe('buildOpeningPrompt — thư xin việc', () => {
  it('không tích thì dặn BỎ HẲN bước soạn thư', () => {
    const prompt = buildOpeningPrompt({ jobDescription: 'Tuyển kế toán' });

    expect(prompt).toContain('KHÔNG yêu cầu thư xin việc');
    expect(prompt).toContain('BỎ HẲN');
  });

  it('tích thì dặn soạn cả hai', () => {
    const prompt = buildOpeningPrompt({
      jobDescription: 'Tuyển kế toán',
      coverLetter: true,
    });

    expect(prompt).toContain('CÓ yêu cầu thư xin việc');
    expect(prompt).not.toContain('BỎ HẲN');
  });

  it('dặn về thư đứng SAU mô tả công việc, để câu cuối là câu của ta', () => {
    const prompt = buildOpeningPrompt({ jobDescription: 'Tuyển kế toán' });

    expect(prompt.indexOf('MÔ TẢ CÔNG VIỆC')).toBeLessThan(
      prompt.indexOf('thư xin việc'),
    );
  });

  it('mặc định là KHÔNG, không phải bỏ trống', () => {
    const prompt = buildOpeningPrompt({ jobUrl: 'https://x.test' });

    expect(prompt).toContain('KHÔNG yêu cầu thư xin việc');
  });
});
