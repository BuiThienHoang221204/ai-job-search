export class JsonObjectFilter {
  private started = false;
  private finished = false;
  private depth = 0;
  private inString = false;
  private escaped = false;

  push(chunk: string): string {
    let out = '';
    for (const char of chunk) {
      if (this.finished) break;
      if (!this.started) {
        if (char !== '{') continue;
        this.started = true;
      }
      out += char;

      if (this.escaped) {
        this.escaped = false;
      } else if (this.inString) {
        if (char === '\\') this.escaped = true;
        else if (char === '"') this.inString = false;
      } else if (char === '"') {
        this.inString = true;
      } else if (char === '{') {
        this.depth += 1;
      } else if (char === '}' && --this.depth === 0) {
        this.finished = true;
      }
    }
    return out;
  }
}

type ChunkPayload = {
  choices?: { index?: number; delta?: { content?: unknown } }[];
};

/** Viết lại MỘT dòng SSE: chỉ đụng `delta.content`, mọi thứ khác đi nguyên vẹn. */
function rewriteLine(
  line: string,
  filters: Map<number, JsonObjectFilter>,
): string {
  if (!line.startsWith('data:')) return line;
  const data = line.slice('data:'.length).trim();
  if (!data || data === '[DONE]') return line;

  let payload: ChunkPayload;
  try {
    payload = JSON.parse(data) as ChunkPayload;
  } catch {
    return line;
  }

  let changed = false;
  for (const choice of payload.choices ?? []) {
    const content = choice.delta?.content;
    if (typeof content !== 'string') continue;
    const index = choice.index ?? 0;
    const filter = filters.get(index) ?? new JsonObjectFilter();
    filters.set(index, filter);
    choice.delta!.content = filter.push(content);
    changed = true;
  }
  return changed ? `data: ${JSON.stringify(payload)}` : line;
}

export function extractJsonFromStream(response: Response): Response {
  if (!response.ok || !response.body) return response;
  if (
    !(response.headers.get('content-type') ?? '').includes('text/event-stream')
  ) {
    return response;
  }

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const filters = new Map<number, JsonObjectFilter>();
  let buffer = '';

  const body = response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        if (!lines.length) return;
        const out = lines.map((line) => rewriteLine(line, filters)).join('\n');
        controller.enqueue(encoder.encode(`${out}\n`));
      },
      flush(controller) {
        buffer += decoder.decode();
        if (buffer)
          controller.enqueue(encoder.encode(rewriteLine(buffer, filters)));
      },
    }),
  );

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
