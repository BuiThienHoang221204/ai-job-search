import {
  evaluateCandidate,
  portalKeyFrom,
} from 'src/modules/scraper/sources/portal-registry.js';

describe('portalKeyFrom', () => {
  test('bỏ hậu tố -search', () => {
    expect(portalKeyFrom('itviec-search')).toBe('itviec');
    expect(portalKeyFrom('linkedin-search')).toBe('linkedin');
  });

  test('bỏ cả -jobs và -portal', () => {
    expect(portalKeyFrom('topcv-jobs')).toBe('topcv');
    expect(portalKeyFrom('vietnamworks-portal')).toBe('vietnamworks');
  });

  test('giữ nguyên khi không có hậu tố quen thuộc', () => {
    expect(portalKeyFrom('topcv')).toBe('topcv');
  });

  test('chỉ cắt hậu tố ở CUỐI, không cắt giữa tên', () => {
    // "search-engine-jobs" phải thành "search-engine", không thành "-engine".
    expect(portalKeyFrom('search-engine-jobs')).toBe('search-engine');
  });
});

describe('evaluateCandidate', () => {
  const base = {
    directory: 'itviec-search',
    hasSkillFile: true,
    hasCli: true,
    frontmatter: {},
  };

  test('thư mục đủ điều kiện thì thành portal', () => {
    const result = evaluateCandidate(base);
    expect(result).toEqual({
      entry: {
        key: 'itviec',
        directory: 'itviec-search',
        cliPath: '.agents/skills/itviec-search/cli/src/cli.ts',
        enabled: true,
        supportsJobAge: false,
        description: '',
      },
    });
  });

  test('khai jobAge: true thì portal tự lọc được theo ngày đăng', () => {
    const result = evaluateCandidate({
      ...base,
      frontmatter: { jobAge: true },
    });
    expect('entry' in result && result.entry.supportsJobAge).toBe(true);
  });

  test('thiếu SKILL.md thì bỏ qua', () => {
    const result = evaluateCandidate({ ...base, hasSkillFile: false });
    expect(result).toEqual({ skip: 'không có SKILL.md' });
  });

  test('có SKILL.md nhưng không có CLI thì bỏ qua', () => {
    // job-scraper là skill kịch bản cho agent chat, không phải portal.
    const result = evaluateCandidate({ ...base, hasCli: false });
    expect(result).toEqual({ skip: 'không có cli/src/cli.ts' });
  });

  test('enabled vắng mặt thì coi như BẬT', () => {
    // Framework dùng quy ước này: chỉ khi muốn tắt mới phải ghi ra.
    const result = evaluateCandidate(base);
    expect('entry' in result && result.entry.enabled).toBe(true);
  });

  test('enabled: false thì tắt', () => {
    const result = evaluateCandidate({
      ...base,
      frontmatter: { enabled: false },
    });
    expect('entry' in result && result.entry.enabled).toBe(false);
  });

  test('enabled: true thì bật', () => {
    const result = evaluateCandidate({
      ...base,
      frontmatter: { enabled: true },
    });
    expect('entry' in result && result.entry.enabled).toBe(true);
  });

  test('chỉ đúng false mới tắt, chuỗi "false" thì KHÔNG', () => {
    // YAML đã phân tích rồi nên `enabled: false` là boolean. Nếu ai đó viết
    // `enabled: "false"` thì đó là chuỗi, và im lặng coi là tắt sẽ khiến họ
    // ngồi tìm mãi không hiểu vì sao portal biến mất.
    const result = evaluateCandidate({
      ...base,
      frontmatter: { enabled: 'false' },
    });
    expect('entry' in result && result.entry.enabled).toBe(true);
  });

  test('gom mô tả nhiều dòng thành một dòng', () => {
    const result = evaluateCandidate({
      ...base,
      frontmatter: { description: 'Tìm việc\n  trên   ITviec\n' },
    });
    expect('entry' in result && result.entry.description).toBe(
      'Tìm việc trên ITviec',
    );
  });

  test('mô tả quá dài bị cắt', () => {
    const result = evaluateCandidate({
      ...base,
      frontmatter: { description: 'x'.repeat(500) },
    });
    expect('entry' in result && result.entry.description.length).toBe(200);
  });

  test('mô tả không phải chuỗi thì thành rỗng, không nổ', () => {
    const result = evaluateCandidate({
      ...base,
      frontmatter: { description: { a: 1 } },
    });
    expect('entry' in result && result.entry.description).toBe('');
  });
});
