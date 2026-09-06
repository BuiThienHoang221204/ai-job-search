import type { ModelMessage } from 'ai';
import { compactHistory } from 'src/modules/agent/compact-history.js';

const saveCall = (name: string, content: string): ModelMessage => ({
  role: 'assistant',
  content: [
    {
      type: 'tool-call',
      toolCallId: `call-${name}`,
      toolName: 'save_artifact',
      input: { name, content },
    },
  ],
});

const contentOf = (message: ModelMessage): { name: string; content: string } =>
  (message.content as Array<{ input: { name: string; content: string } }>)[0]
    .input;

describe('compactHistory', () => {
  it('thay nội dung file dài bằng ghi chú trỏ sang read_artifact', () => {
    const tex = 'x'.repeat(50_000);

    const [message] = compactHistory([saveCall('cv/main.tex', tex)]);

    const input = contentOf(message);
    expect(input.name).toBe('cv/main.tex');
    expect(input.content).toContain('50000 ký tự');
    expect(input.content).toContain('read_artifact');
    expect(input.content.length).toBeLessThan(200);
  });

  it('giữ nguyên nội dung ngắn vì nén không đáng', () => {
    const short = 'Kính gửi anh chị,';

    const [message] = compactHistory([saveCall('thu.md', short)]);

    expect(contentOf(message).content).toBe(short);
  });

  it('trả về đúng mảng cũ khi không có gì để nén', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: 'Ứng tuyển tin này giúp tôi' },
      { role: 'assistant', content: 'Đã đọc xong mô tả công việc.' },
    ];

    expect(compactHistory(messages)).toBe(messages);
  });

  it('không đụng tới tool khác dù tham số cũng dài', () => {
    const long = 'y'.repeat(50_000);
    const messages: ModelMessage[] = [
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call-fetch',
            toolName: 'fetch_url',
            input: { url: 'https://x.test', content: long },
          },
        ],
      },
    ];

    expect(compactHistory(messages)).toBe(messages);
  });

  it('nén mọi lần lưu trước đó, không chỉ lần gần nhất', () => {
    const big = 'z'.repeat(30_000);

    const result = compactHistory([
      saveCall('cv/main.tex', big),
      { role: 'user', content: 'Sửa lại phần kinh nghiệm' },
      saveCall('cover_letters/main.tex', big),
    ]);

    expect(contentOf(result[0]).content).toContain('read_artifact');
    expect(contentOf(result[2]).content).toContain('read_artifact');
    expect(result[1]).toEqual({
      role: 'user',
      content: 'Sửa lại phần kinh nghiệm',
    });
  });

  it('không sửa mảng gốc', () => {
    const original = saveCall('cv/main.tex', 'w'.repeat(9_000));

    compactHistory([original]);

    expect(contentOf(original).content).toHaveLength(9_000);
  });
});
