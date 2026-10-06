const FENCED_BLOCK = /```[a-zA-Z]*[^\S\r\n]*\r?\n([\s\S]*?)```/;

const parses = (text: string): boolean => {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
};

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

export function extractJson(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return text;
  if (parses(trimmed)) return trimmed;

  const fenced = FENCED_BLOCK.exec(trimmed)?.[1]?.trim();
  if (fenced && parses(fenced)) return fenced;

  if (trimmed.indexOf('{') === -1) return text;

  const slice = balancedSlice(trimmed, '{');
  return slice && parses(slice) ? slice : text;
}

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
