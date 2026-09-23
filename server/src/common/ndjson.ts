import type { Logger } from '@nestjs/common';
import type { Response } from 'express';
import type { ModelStreamEvent } from './stream-event.js';

export type NdjsonStream<T> = {
  response: Response;
  logger: Logger;
  label: string;
  events: AsyncIterable<ModelStreamEvent<T>>;
  prelude?: ModelStreamEvent<unknown>;
  onAbandon?: () => void;
};

/** Một sự kiện lẻ thành stream, cho nhánh trả kết quả cache mà không gọi model. */
export function justDone<T>(result: T): AsyncIterable<ModelStreamEvent<T>> {
  return {
    // eslint-disable-next-line @typescript-eslint/require-await
    async *[Symbol.asyncIterator]() {
      yield { type: 'done', result };
    },
  };
}

/**
 * Đẩy `ModelStreamEvent` ra response dạng NDJSON — sáu route stream dùng chung khối này.
 *
 * `X-Accel-Buffering: no` là bắt buộc: nginx gom buffer thì người dùng không thấy
 * gì cho tới khi cả lượt xong, đúng thứ mà stream sinh ra để tránh. Hỏng GIỮA
 * chừng thì `destroy()` chứ không `end()` — đã gửi nửa dòng JSON, đóng tử tế
 * khiến bên đọc tưởng dữ liệu đã đủ.
 */
export async function streamNdjson<T>(stream: NdjsonStream<T>): Promise<void> {
  const { response, logger, label, events, prelude, onAbandon } = stream;

  response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  response.setHeader('Cache-Control', 'no-cache, no-transform');
  response.setHeader('X-Accel-Buffering', 'no');
  response.flushHeaders();

  if (prelude) response.write(`${JSON.stringify(prelude)}\n`);

  let finished = false;
  if (onAbandon) {
    response.on('close', () => {
      if (finished) return;
      logger.warn(`Người dùng rời trang giữa lượt ${label}; xếp lại hàng đợi`);
      onAbandon();
    });
  }

  try {
    for await (const event of events) {
      response.write(`${JSON.stringify(event)}\n`);
    }
    finished = true;
  } catch (error) {
    finished = true;
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Stream ${label} hỏng: ${message}`);
    response.destroy();
    return;
  }

  response.end();
}
