import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type Blacklist,
  deadModels,
  isBlocked,
  loadBlacklist,
  looksLikeOutage,
} from 'src/modules/ai/utils/model-blacklist.js';

describe('loadBlacklist', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'blacklist-'));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const write = (name: string, body: string): string => {
    const path = join(dir, name);
    writeFileSync(path, body);
    return path;
  };

  test('đọc models và manual từ JSON hợp lệ', () => {
    const path = write(
      'ok.json',
      JSON.stringify({
        models: ['a/b', 'c:free'],
        manual: {
          prefixes: ['x/'],
          suffixes: ['openrouter/free'],
          contains: ['haiku'],
        },
      }),
    );
    const bl = loadBlacklist(path);
    expect([...bl.models].sort()).toEqual(['a/b', 'c:free']);
    expect(bl.manual.prefixes).toEqual(['x/']);
    expect(bl.manual.suffixes).toEqual(['openrouter/free']);
    expect(bl.manual.contains).toEqual(['haiku']);
  });

  test('thiếu file hoặc JSON hỏng → rỗng (không chặn nhầm, không sập)', () => {
    const empty = loadBlacklist(join(dir, 'khong-ton-tai.json'));
    expect(empty.models.size).toBe(0);
    expect(empty.manual.prefixes).toEqual([]);
    expect(loadBlacklist(write('bad.json', '{not json')).models.size).toBe(0);
  });

  test('thiếu manual hoặc sai kiểu → mảng rỗng', () => {
    const bl = loadBlacklist(write('nomanual.json', '{"models":["a/b"]}'));
    expect(bl.manual.prefixes).toEqual([]);
    expect(bl.manual.suffixes).toEqual([]);
    expect(bl.manual.contains).toEqual([]);
  });
});

describe('isBlocked', () => {
  const bl: Blacklist = {
    models: new Set(['unorouter/glm-4:free', 'omniroute/cfp/qwq-32b']),
    manual: {
      prefixes: ['omniroute/auto/', 'omniroute/agy/gemini-3.7'],
      suffixes: ['openrouter/free', 'openrouter/auto'],
      contains: ['claude-haiku'],
    },
  };

  test('khớp đúng id trong models theo (lõi, model); lõi khác thì không', () => {
    expect(isBlocked('unorouter/glm-4:free', bl)).toBe(true);
    expect(isBlocked('omniroute/glm-4:free', bl)).toBe(false);
  });

  test('trúng mẫu cấm tay: tiền tố, hậu tố, chứa chuỗi', () => {
    expect(isBlocked('omniroute/auto/foo', bl)).toBe(true);
    expect(isBlocked('omniroute/agy/gemini-3.7-pro', bl)).toBe(true);
    expect(isBlocked('kilo/openrouter/auto', bl)).toBe(true);
    expect(isBlocked('omniroute/x/claude-haiku-20240307', bl)).toBe(true);
  });

  test('không trúng gì thì không chặn', () => {
    expect(isBlocked('omniroute/antigravity/gemini-3-flash', bl)).toBe(false);
  });
});

describe('deadModels', () => {
  test('giữ >minCalls lượt và không có lượt thành công; bỏ model còn sống', () => {
    const totals = [
      { id: 'a/dead', total: 6 },
      { id: 'a/few', total: 3 },
      { id: 'b/alive', total: 20 },
    ];
    expect(deadModels(totals, new Set(['b/alive']), 5)).toEqual(['a/dead']);
  });

  test('đủ lượt nhưng có thành công thì không chết; đúng ngưỡng (=min) cũng loại', () => {
    const totals = [
      { id: 'a/x', total: 5 },
      { id: 'a/y', total: 6 },
    ];
    expect(deadModels(totals, new Set(['a/y']), 5)).toEqual([]);
  });
});

describe('looksLikeOutage', () => {
  test('chặn quá tỉ lệ cho phép thì nghi outage', () => {
    expect(looksLikeOutage(50, 100, 0.4)).toBe(true);
    expect(looksLikeOutage(40, 100, 0.4)).toBe(false);
  });
});
