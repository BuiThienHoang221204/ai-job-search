import type { Logger } from '@nestjs/common';
import type { Response } from 'express';
import type { ModelStreamEvent } from './stream-event';
import { messageOf } from './error-message';

const HEARTBEAT_MS = 10_000;

export type NdjsonStream<T> = {
  response: Response;
  logger: Logger;
  label: string;
  events: AsyncIterable<ModelStreamEvent<T>>;
  prelude?: ModelStreamEvent<unknown>;
  onAbandon?: () => void;
};

export function justDone<T>(result: T): AsyncIterable<ModelStreamEvent<T>> {
  return {
    // eslint-disable-next-line @typescript-eslint/require-await
    async *[Symbol.asyncIterator]() {
      yield { type: 'done', result };
    },
  };
}

/** Đẩy sự kiện ra NDJSON; hỏng giữa chừng thì `destroy()` để client không tưởng dữ liệu đã đủ. */
export async function streamNdjson<T>(stream: NdjsonStream<T>): Promise<void> {
  const { response, logger, label, events, prelude, onAbandon } = stream;

  response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  response.setHeader('Cache-Control', 'no-cache, no-transform');
  response.setHeader('X-Accel-Buffering', 'no');
  response.flushHeaders();

  if (prelude) response.write(`${JSON.stringify(prelude)}\n`);

  let finished = false;

  const beat = setInterval(() => {
    if (!finished) response.write('\n');
  }, HEARTBEAT_MS);

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
    const message = messageOf(error);
    logger.error(`Stream ${label} hỏng: ${message}`);
    response.destroy();
    return;
  } finally {
    clearInterval(beat);
  }

  response.end();
}
