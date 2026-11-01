import { readFileSync } from 'node:fs';

export type ManualBlacklist = {
  prefixes: string[];
  suffixes: string[];
  contains: string[];
};

export type Blacklist = {
  models: Set<string>;
  manual: ManualBlacklist;
};

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : [];
}

/** Đọc blacklist từ file JSON: `models` (tự sinh, khớp ĐÚNG id `lõi/model`) và `manual` (cấm tay — tiền tố / hậu tố / chứa chuỗi). Thiếu hoặc hỏng file thì RỖNG — không chặn nhầm, không làm sập app. */
export function loadBlacklist(path: string): Blacklist {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
      models?: unknown;
      manual?: { prefixes?: unknown; suffixes?: unknown; contains?: unknown };
    };
    return {
      models: new Set(toStringArray(parsed.models)),
      manual: {
        prefixes: toStringArray(parsed.manual?.prefixes),
        suffixes: toStringArray(parsed.manual?.suffixes),
        contains: toStringArray(parsed.manual?.contains),
      },
    };
  } catch {
    return {
      models: new Set(),
      manual: { prefixes: [], suffixes: [], contains: [] },
    };
  }
}

/** Model có bị chặn không: khớp ĐÚNG id trong `models` (tự sinh), hoặc trúng một mẫu cấm tay — tiền tố (`startsWith`), hậu tố (`endsWith`) hoặc chứa chuỗi. Hậu tố và chứa so không phân biệt hoa thường. */
export function isBlocked(ref: string, bl: Blacklist): boolean {
  if (bl.models.has(ref)) return true;
  if (bl.manual.prefixes.some((p) => ref.startsWith(p))) return true;
  const lower = ref.toLowerCase();
  return (
    bl.manual.suffixes.some((s) => lower.endsWith(s)) ||
    bl.manual.contains.some((c) => lower.includes(c))
  );
}

/** Lọc (lõi, model) chết từ thống kê cửa sổ: hơn `minCalls` lượt gọi và KHÔNG lượt nào thành công (`id` không có trong `alive`). `id` đầy đủ dạng `lõi/model`. */
export function deadModels(
  totals: { id: string; total: number }[],
  alive: ReadonlySet<string>,
  minCalls: number,
): string[] {
  return totals
    .filter((t) => t.total > minCalls && !alive.has(t.id))
    .map((t) => t.id)
    .sort();
}

/** Một lượt regenerate chặn quá nhiều so với số model được probe trong cửa sổ thường là dấu hiệu gateway sập cả loạt (không phải model chết thật) — khi đó giữ list cũ thay vì ghi đè. */
export function looksLikeOutage(
  deadCount: number,
  probedCount: number,
  capFraction: number,
): boolean {
  return deadCount > probedCount * capFraction;
}
