import { trimToolOutput } from 'src/modules/agent/trim-output.js';

describe('trimToolOutput', () => {
  it('cắt chuỗi dài và ghi rõ đã cắt bao nhiêu', () => {
    const out = trimToolOutput({ content: 'x'.repeat(8000) }) as {
      content: string;
    };
    expect(out.content).toHaveLength(500 + '… [cắt 7500 ký tự]'.length);
    expect(out.content).toContain('… [cắt 7500 ký tự]');
  });

  it('giữ nguyên chuỗi ngắn', () => {
    expect(trimToolOutput({ saved: 'cv.tex' })).toEqual({ saved: 'cv.tex' });
  });

  it('giữ nguyên các khoá mà giao diện đọc để tóm tắt một bước', () => {
    const output = {
      error: 'Trang này chặn truy cập từ máy chủ (HTTP 403).',
      ok: false,
      reason: 'bị chặn',
      pages: 2,
      file: '04-job-evaluation.md',
    };
    expect(trimToolOutput(output)).toEqual(output);
  });

  it('giữ ĐỘ DÀI mảng vì giao diện đọc results.length', () => {
    const out = trimToolOutput({
      results: [{ text: 'y'.repeat(900) }, { text: 'z' }, { text: 'w' }],
    }) as { results: unknown[] };
    expect(out.results).toHaveLength(3);
  });

  it('đi xuyên mảng và object lồng nhau', () => {
    const out = trimToolOutput([
      { tool: 'fetch_url', output: { text: 'a'.repeat(600) } },
    ]) as Array<{ output: { text: string } }>;
    expect(out[0].output.text).toContain('… [cắt 100 ký tự]');
  });

  it('không đụng tới số, boolean và null', () => {
    expect(trimToolOutput({ pages: 3, ok: true, note: null })).toEqual({
      pages: 3,
      ok: true,
      note: null,
    });
  });
});
