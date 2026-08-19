import type { ZodType } from 'zod';

/** Tên các trường ở tầng ngoài cùng của schema. Rỗng nếu schema không phải object. */
export function topLevelKeys(schema: ZodType): string[] {
  const shape = (schema as { shape?: Record<string, unknown> }).shape;
  return shape ? Object.keys(shape) : [];
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Cắt lấy object JSON ngoài cùng, bỏ rào ```json và mọi lời dẫn quanh nó. */
function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) return null;

  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') inString = true;
    else if (char === '{' || char === '[') stack.push(char);
    else if (char === '}' || char === ']') {
      stack.pop();
      if (!stack.length) return text.slice(start, i + 1);
    }
  }

  // Model bị cắt giữa chừng: đóng nốt những ngoặc còn mở rồi để JSON.parse phán.
  const closing = stack
    .reverse()
    .map((open) => (open === '{' ? '}' : ']'))
    .join('');
  return `${text.slice(start)}${inString ? '"' : ''}${closing}`;
}

/** Gỡ một tầng bọc thừa kiểu `{"result": {...}}`. */
function unwrapSingleKey(
  root: Record<string, unknown>,
  expected: string[],
): Record<string, unknown> {
  const keys = Object.keys(root);
  if (keys.length !== 1 || expected.includes(keys[0])) return root;

  const inner = root[keys[0]];
  return isPlainObject(inner) ? inner : root;
}

/** Tìm `key` ở các tầng trong rồi tách nó ra khỏi cha. */
function detach(
  root: Record<string, unknown>,
  key: string,
): { found: boolean; value?: unknown } {
  const queue: Array<Record<string, unknown>> = [root];

  while (queue.length) {
    const node = queue.shift()!;
    for (const [name, value] of Object.entries(node)) {
      if (node !== root && name === key) {
        delete node[name];
        return { found: true, value };
      }
      if (isPlainObject(value)) queue.push(value);
    }
  }
  return { found: false };
}

/** Kéo các trường bị lồng nhầm vào tầng trong ra lại tầng ngoài cùng. */
function hoistExpectedKeys(
  root: Record<string, unknown>,
  expected: string[],
): void {
  let moved = true;
  while (moved) {
    moved = false;
    for (const key of expected) {
      if (key in root) continue;
      const { found, value } = detach(root, key);
      if (!found) continue;
      root[key] = value;
      moved = true;
    }
  }
}

/**
 * Sửa văn bản model trả về khi nó không parse được hoặc lệch schema.
 * Trả `null` nếu không sửa được, để lỗi gốc ném ra nguyên vẹn.
 */
export function repairJsonText(
  text: string,
  expected: string[],
): string | null {
  const slice = extractJsonObject(text);
  if (!slice) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(slice);
  } catch {
    return null;
  }
  if (!isPlainObject(parsed)) return null;

  const root = unwrapSingleKey(parsed, expected);
  hoistExpectedKeys(root, expected);

  const repaired = JSON.stringify(root);
  return repaired === text.trim() ? null : repaired;
}
