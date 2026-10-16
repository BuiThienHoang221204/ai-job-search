import {
  ConflictException,
  NotFoundException,
  type Logger,
} from '@nestjs/common';
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
  return {
    written,
    mocks: response,
    response: response as unknown as Response,
  };
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

/** Ném `error` ngay, hoặc sau khi đã phát một mảnh `partial`. */
function failingEvents(
  error: Error,
  afterPartial: boolean,
): AsyncIterable<ModelStreamEvent<{ ok: boolean }>> {
  return {
    // eslint-disable-next-line @typescript-eslint/require-await
    async *[Symbol.asyncIterator]() {
      if (afterPartial) yield { type: 'partial', data: { step: 1 } };
      throw error;
    },
  };
}

describe('streamNdjson - lỗi trước sự kiện đầu tiên', () => {
  test('HttpException trước sự kiện đầu thành sự kiện error kèm mã, rồi end() chứ không destroy()', async () => {
    const { mocks, response } = fakeResponse();

    await streamNdjson({
      response,
      logger: fakeLogger(),
      label: 'thử',
      events: failingEvents(new NotFoundException('Không tìm thấy X'), false),
    });

    expect(mocks.destroy).not.toHaveBeenCalled();
    expect(mocks.end).toHaveBeenCalledTimes(1);
    const [chunk] = mocks.end.mock.calls[0] as unknown as [string];
    expect(JSON.parse(chunk)).toEqual({
      type: 'error',
      message: 'Không tìm thấy X',
      statusCode: 404,
    });
  });

  test('prelude không tính là sự kiện của generator: 409 sau prelude vẫn thành sự kiện error', async () => {
    const { written, mocks, response } = fakeResponse();

    await streamNdjson({
      response,
      logger: fakeLogger(),
      label: 'thử',
      prelude: { type: 'partial', data: { step: 0 } },
      events: failingEvents(new ConflictException('Đang chạy'), false),
    });

    expect(written).toHaveLength(1);
    expect(mocks.destroy).not.toHaveBeenCalled();
    const [chunk] = mocks.end.mock.calls[0] as unknown as [string];
    expect(JSON.parse(chunk)).toMatchObject({
      type: 'error',
      statusCode: 409,
    });
  });

  test('lỗi thường trước sự kiện đầu vẫn destroy() như cũ, không lộ câu lỗi thô', async () => {
    const { mocks, response } = fakeResponse();

    await streamNdjson({
      response,
      logger: fakeLogger(),
      label: 'thử',
      events: failingEvents(new Error('ECONNRESET 10.0.0.1'), false),
    });

    expect(mocks.destroy).toHaveBeenCalledTimes(1);
    expect(mocks.end).not.toHaveBeenCalled();
  });

  test('HttpException SAU khi đã có dữ liệu thì destroy() để client không tưởng đã đủ', async () => {
    const { mocks, response } = fakeResponse();

    await streamNdjson({
      response,
      logger: fakeLogger(),
      label: 'thử',
      events: failingEvents(new ConflictException('Đang chạy'), true),
    });

    expect(mocks.destroy).toHaveBeenCalledTimes(1);
    expect(mocks.end).not.toHaveBeenCalled();
  });
});
