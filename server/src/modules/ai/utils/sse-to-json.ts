function parsePayload(line: string): Record<string, unknown> | null {
  if (!line.startsWith('data:')) return null;
  const payload = line.slice(5).trim();
  if (!payload || payload === '[DONE]') return null;
  try {
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Chuyển đổi dữ liệu SSE dạng text thành Response OpenAI Chat Completion hoặc Response lỗi. */
export function parseSSEToResponse(rawSSE: string): Response {
  let content = '';
  let finishReason = 'stop';
  let usage: Record<string, unknown> | undefined;
  let seenChunk = false;

  for (const line of rawSSE.split('\n')) {
    const chunk = parsePayload(line.trim());
    if (!chunk) continue;

    seenChunk = true;
    const err = chunk.error as Record<string, unknown> | undefined;
    if (err) {
      const code = Number(err.status ?? err.code);
      const status =
        Number.isInteger(code) && code >= 400 && code <= 599 ? code : 502;
      return new Response(JSON.stringify(chunk), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    }

    const choice = (
      chunk.choices as Array<Record<string, unknown>> | undefined
    )?.[0];
    const delta = choice?.delta as Record<string, unknown> | undefined;
    if (typeof delta?.content === 'string') content += delta.content;
    if (typeof choice?.finish_reason === 'string') {
      finishReason = choice.finish_reason;
    }
    if (chunk.usage && typeof chunk.usage === 'object') {
      usage = chunk.usage as Record<string, unknown>;
    }
  }

  if (!seenChunk) {
    return new Response(
      JSON.stringify({ error: { message: 'Upstream returned empty stream' } }),
      { status: 502, headers: { 'content-type': 'application/json' } },
    );
  }

  const body: Record<string, unknown> = {
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: finishReason,
      },
    ],
  };
  if (usage) body.usage = usage;

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
