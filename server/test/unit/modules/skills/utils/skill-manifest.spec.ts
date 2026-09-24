import type { LoadedSkill } from 'src/modules/skills/services/skill-registry.service.js';
import { toManifest } from 'src/modules/skills/utils/skill-manifest.js';

const skill = (over: Partial<LoadedSkill> = {}): LoadedSkill => ({
  name: 'job-application-assistant',
  description: 'mô tả',
  allowedTools: ['Read'],
  frameworkVersion: '1.1.0',
  body: 'thân',
  references: new Map(),
  contentHash: 'abc123',
  ...over,
});

describe('toManifest', () => {
  test('liệt kê file tham chiếu theo tên, đếm byte UTF-8 chứ không đếm ký tự', () => {
    const manifest = toManifest(
      skill({
        references: new Map([
          ['08-application-forms.md', 'abc'],
          ['01-candidate-profile.md', 'hồ sơ'],
        ]),
      }),
    );

    expect(manifest.references).toEqual([
      { name: '01-candidate-profile.md', bytes: 8 },
      { name: '08-application-forms.md', bytes: 3 },
    ]);
    expect(manifest.bodyBytes).toBe(5);
    expect(manifest.contentHash).toBe('abc123');
  });

  test('không lộ nội dung prompt', () => {
    const manifest = toManifest(
      skill({ references: new Map([['a.md', 'bí mật']]) }),
    );

    expect(JSON.stringify(manifest)).not.toContain('bí mật');
    expect(manifest).not.toHaveProperty('body');
  });

  test('skill không có file tham chiếu trả mảng rỗng', () => {
    expect(toManifest(skill()).references).toEqual([]);
  });
});
