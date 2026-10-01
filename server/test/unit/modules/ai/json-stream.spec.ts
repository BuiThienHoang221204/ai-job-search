import {
  JsonObjectFilter,
  extractJsonFromStream,
} from 'src/modules/ai/utils/json-stream.js';

// Hình dạng thật của `ling-3.0-flash-fin-free` ngày 2026-09-28: hàng rào mở, object, hàng rào đóng.
const FENCED =
  '```json\n{"eligibility":{"verdict":"PASS","note":"có } và \\" trong chuỗi"},"diem":7}\n```';
const OBJECT =
  '{"eligibility":{"verdict":"PASS","note":"có } và \\" trong chuỗi"},"diem":7}';

const pushAll = (pieces: string[]) => {
  const filter = new JsonObjectFilter();
  return pieces.map((piece) => filter.push(piece)).join('');
};

describe('JsonObjectFilter', () => {
  test('bỏ hàng rào ```json và hàng rào đóng, giữ nguyên object', () => {
    expect(pushAll([FENCED])).toBe(OBJECT);
  });

  test('cắt TỪNG KÝ TỰ một vẫn ra đúng: hàng rào hay dấu ngoặc có thể rơi giữa hai mảnh', () => {
    expect(pushAll([...FENCED])).toBe(OBJECT);
  });

  test('dấu } nằm TRONG chuỗi không đóng object sớm', () => {
    expect(pushAll(['{"a":"x}', 'y","b":1}'])).toBe('{"a":"x}y","b":1}');
  });

  test('bỏ câu dẫn trước object và chữ thừa sau nó', () => {
    expect(
      pushAll(['Đây là kết quả: ', '{"a":1}', ' Chúc bạn may mắn {x}']),
    ).toBe('{"a":1}');
  });

  test('mở đầu bằng [ trong câu dẫn thì KHÔNG nhận là gốc', () => {
    expect(pushAll(['[Kết quả] ', '{"a":[1,2]}'])).toBe('{"a":[1,2]}');
  });

  test('toàn văn xuôi thì không phát gì — để lưới rơi về đường không-stream bắt', () => {
    expect(pushAll(['Tôi không thể chấm điểm tin này.'])).toBe('');
  });
});

const sse = (content: string) =>
  `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content } }] })}\n\n`;

const streamOf = (text: string, pieceSize: number) => {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let at = 0; at < bytes.length; at += pieceSize) {
        controller.enqueue(bytes.slice(at, at + pieceSize));
      }
      controller.close();
    },
  });
};

const contentOf = async (response: Response) => {
  const text = await response.text();
  return text
    .split('\n')
    .filter((line) => line.startsWith('data:') && !line.includes('[DONE]'))
    .map((line) => {
      const payload = JSON.parse(line.slice(5)) as {
        choices?: { delta?: { content?: string } }[];
      };
      return payload.choices?.[0]?.delta?.content ?? '';
    })
    .join('');
};

describe('extractJsonFromStream', () => {
  const body =
    ['```json\n', '{"note":"ứng', ' viên đạt"}', '\n```'].map(sse).join('') +
    'data: [DONE]\n\n';

  test('lọc delta.content của phản hồi SSE, kể cả khi byte bị cắt giữa dòng', async () => {
    // Cỡ 7 byte cắt ngang cả dòng `data:` lẫn chữ tiếng Việt nhiều byte.
    const response = new Response(streamOf(body, 7), {
      headers: { 'content-type': 'text/event-stream' },
    });

    expect(await contentOf(extractJsonFromStream(response))).toBe(
      '{"note":"ứng viên đạt"}',
    );
  });

  test('giữ nguyên dòng [DONE]', async () => {
    const response = new Response(streamOf(body, 64), {
      headers: { 'content-type': 'text/event-stream' },
    });

    expect(await extractJsonFromStream(response).text()).toContain(
      'data: [DONE]',
    );
  });

  test('phản hồi không phải SSE thì trả nguyên vẹn', () => {
    const response = new Response('{"a":1}', {
      headers: { 'content-type': 'application/json' },
    });

    expect(extractJsonFromStream(response)).toBe(response);
  });

  test('phản hồi lỗi thì trả nguyên vẹn, để chuỗi dự phòng đọc được mã trạng thái', () => {
    const response = new Response('rate limit', {
      status: 429,
      headers: { 'content-type': 'text/event-stream' },
    });

    expect(extractJsonFromStream(response)).toBe(response);
  });
});
