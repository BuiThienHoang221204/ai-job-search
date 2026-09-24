/** Hàng rào ``` ở BẤT KỲ đâu, không bắt buộc bao trọn phản hồi — model hay viết một câu dẫn trước khi mở hàng rào. */
const FENCED_BLOCK = /```[a-zA-Z]*[^\S\r\n]*\r?\n([\s\S]*?)```/;

const parses = (text: string): boolean => {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
};

/**
 * Cắt đúng một giá trị JSON cân bằng ngoặc, bắt đầu từ `open` đầu tiên.
 */
function balancedSlice(text: string, open: '{' | '['): string | null {
  const close = open === '{' ? '}' : ']';
  const start = text.indexOf(open);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let at = start; at < text.length; at += 1) {
    const char = text[at];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (inString) {
      if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === open) depth += 1;
    else if (char === close && --depth === 0) return text.slice(start, at + 1);
  }
  return null;
}

/**
 * Bóc JSON ra khỏi thứ model thật sự viết. Không bóc được thì trả NGUYÊN VĂN.
 */
export function extractJson(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return text;
  if (parses(trimmed)) return trimmed;

  const fenced = FENCED_BLOCK.exec(trimmed)?.[1]?.trim();
  if (fenced && parses(fenced)) return fenced;

  // Chỉ bóc theo dấu mở ĐẦU TIÊN của cả chuỗi. Thử lần lượt `{` rồi `[` sẽ moi
  // một mảnh RUỘT ra khỏi object bị cắt cụt: hỏng thật 2026-09-23, object dở
  // dang cho ra đúng mảng `strengths` và zod báo "expected object, received
  // array" — một thông báo lạc hướng hoàn toàn so với nguyên nhân là cắt cụt.
  const curly = trimmed.indexOf('{');
  const square = trimmed.indexOf('[');
  const open = curly === -1 ? '[' : square === -1 || curly < square ? '{' : '[';
  if (trimmed.indexOf(open) === -1) return text;

  const slice = balancedSlice(trimmed, open);
  return slice && parses(slice) ? slice : text;
}

/** Áp `extractJson` lên phần `content` của phản hồi chat. Bỏ qua stream: nó là `text/event-stream`, không phải JSON. */
export async function extractJsonFromResponse(
  response: Response,
): Promise<Response> {
  if (!response.ok) return response;
  if (
    !(response.headers.get('content-type') ?? '').includes('application/json')
  ) {
    return response;
  }

  const raw = await response.text();
  const rebuild = (body: string): Response =>
    new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });

  try {
    const payload = JSON.parse(raw) as {
      choices?: { message?: { content?: unknown } }[];
    };
    let changed = false;
    for (const choice of payload?.choices ?? []) {
      const content = choice?.message?.content;
      if (typeof content !== 'string') continue;

      const unwrapped = extractJson(content);
      if (unwrapped === content) continue;

      choice.message!.content = unwrapped;
      changed = true;
    }
    return rebuild(changed ? JSON.stringify(payload) : raw);
  } catch {
    return rebuild(raw);
  }
}
