import type { Logger } from '@nestjs/common';
import type { Response } from 'express';
import { streamNdjson } from 'src/common/ndjson.js';
import type { ModelStreamEvent } from 'src/common/stream-event.js';

/// Nhịp tim chỉ đập sau 10 giây nên không lượt thử tay nào chạm tới; hỏng thì im
/// lặng cho tới khi proxy cắt kết nối trên production.
///
/// Nó là DÒNG TRỐNG chứ không phải loại sự kiện mới, và đó là điều kiện để server
/// lên trước client: `model-stream.ts` đã bỏ qua dòng trống sẵn, còn loại lạ thì
/// nó NÉM.

function fakeResponse() {
  const written: string[] = [];
  const response = {
    setHeader: jest.fn(),
    flushHeaders: jest.fn(),
    write: jest.fn((chunk: string) => {
      written.push(chunk);
      return true;
    }),
    end: jest.fn(),
    destroy: jest.fn(),
    on: jest.fn(),
  };
  return { written, response: response as unknown as Response };
}

const fakeLogger = () =>
  ({ warn: jest.fn(), error: jest.fn() }) as unknown as Logger;

/** Phát một sự kiện rồi treo `ms` mili giây trước khi kết thúc. `0` là xong ngay, không đặt hẹn giờ nào. */
function slowEvents(
  ms: number,
): AsyncIterable<ModelStreamEvent<{ ok: boolean }>> {
  return {
    async *[Symbol.asyncIterator]() {
      yield { type: 'done', result: { ok: true } };
      if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms));
    },
  };
}

const beats = (written: string[]) => written.filter((row) => row === '\n');

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('streamNdjson - nhịp tim', () => {
  test('im lặng lâu thì vẫn gửi dòng trống đều đặn', async () => {
    const { written, response } = fakeResponse();

    const running = streamNdjson({
      response,
      logger: fakeLogger(),
      label: 'thử',
      events: slowEvents(35_000),
    });
    await jest.advanceTimersByTimeAsync(35_000);
    await running;

    // 35 giây / nhịp 10 giây → 3 nhịp.
    expect(beats(written)).toHaveLength(3);
  });

  test('nhịp tim là DÒNG TRỐNG, không phải loại sự kiện mới', async () => {
    const { written, response } = fakeResponse();

    const running = streamNdjson({
      response,
      logger: fakeLogger(),
      label: 'thử',
      events: slowEvents(12_000),
    });
    await jest.advanceTimersByTimeAsync(12_000);
    await running;

    for (const row of beats(written)) expect(row).toBe('\n');
    // Không dòng nào được parse ra một sự kiện lạ.
    const events = written.filter((row) => row !== '\n');
    for (const row of events) {
      expect(['partial', 'done', 'error']).toContain(
        (JSON.parse(row) as { type: string }).type,
      );
    }
  });

  test('xong rồi thì NGỪNG đập, không ghi thêm vào response đã đóng', async () => {
    const { written, response } = fakeResponse();

    await streamNdjson({
      response,
      logger: fakeLogger(),
      label: 'thử',
      events: slowEvents(0),
    });
    const afterDone = written.length;

    await jest.advanceTimersByTimeAsync(60_000);
    expect(written).toHaveLength(afterDone);
  });
});
