import { getOrCreateSessionId } from 'src/modules/ai/utils/opencode-session.js';
import { parseSSEToResponse } from 'src/modules/ai/utils/sse-to-json.js';

describe('OpenCode Session Generator', () => {
  test('getOrCreateSessionId: cùng key trả cùng session ID, đúng định dạng ses_ + 26 ký tự', () => {
    const session1 = getOrCreateSessionId('model-a');
    const session2 = getOrCreateSessionId('model-a');
    expect(session1).toBe(session2);
    expect(session1).toMatch(/^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/);

    const sessionOther = getOrCreateSessionId('model-b');
    expect(sessionOther).toMatch(/^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/);
  });
});

describe('OpenCode SSE to Response Parser', () => {
  test('gom các chunk SSE thành Response 200 kèm choices và usage', async () => {
    const rawSSE = [
      'data: {"choices":[{"index":0,"delta":{"role":"assistant","content":"Xin"}}]}',
      'data: {"choices":[{"index":0,"delta":{"content":" chào"}}]}',
      'data: {"choices":[{"index":0,"finish_reason":"stop"}]}',
      'data: {"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}',
      'data: [DONE]',
    ].join('\n');

    const res = parseSSEToResponse(rawSSE);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      choices: [{ message: { content: string }; finish_reason: string }];
      usage: { total_tokens: number };
    };
    expect(body.choices[0].message.content).toBe('Xin chào');
    expect(body.choices[0].finish_reason).toBe('stop');
    expect(body.usage.total_tokens).toBe(15);
  });

  test('chunk lỗi trong luồng SSE trả Response với mã lỗi thật', async () => {
    const errorSSE =
      'data: {"error":{"message":"Rate limit exceeded","code":429}}';
    const res = parseSSEToResponse(errorSSE);
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: { code: number } };
    expect(body.error.code).toBe(429);
  });

  test('chuỗi SSE rỗng trả Response 502', async () => {
    const res = parseSSEToResponse('');
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toContain('empty stream');
  });
});
