import { HttpException, type Logger } from '@nestjs/common';
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
};

export function justDone<T>(result: T): AsyncIterable<ModelStreamEvent<T>> {
  return {
    // eslint-disable-next-line @typescript-eslint/require-await
    async *[Symbol.asyncIterator]() {
      yield { type: 'done', result };
    },
  };
}

/** Đẩy sự kiện ra NDJSON; `HttpException` trước sự kiện đầu thành sự kiện `error`, hỏng giữa chừng thì `destroy()`. */
export async function streamNdjson<T>(stream: NdjsonStream<T>): Promise<void> {
  const { response, logger, label, events, prelude } = stream;

  response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  response.setHeader('Cache-Control', 'no-cache, no-transform');
  response.setHeader('X-Accel-Buffering', 'no');
  response.flushHeaders();

  if (prelude) response.write(`${JSON.stringify(prelude)}\n`);

  let finished = false;
  let written = 0;

  const beat = setInterval(() => {
    if (!finished) response.write('\n');
  }, HEARTBEAT_MS);

  try {
    for await (const event of events) {
      response.write(`${JSON.stringify(event)}\n`);
      written += 1;
    }
    finished = true;
  } catch (error) {
    finished = true;
    const message = messageOf(error);
    if (written === 0 && error instanceof HttpException) {
      logger.warn(`Stream ${label} bị từ chối: ${message}`);
      const event: ModelStreamEvent<T> = {
        type: 'error',
        message,
        statusCode: error.getStatus(),
      };
      response.end(`${JSON.stringify(event)}\n`);
      return;
    }
    logger.error(`Stream ${label} hỏng: ${message}`);
    response.destroy();
    return;
  } finally {
    clearInterval(beat);
  }

  response.end();
}
