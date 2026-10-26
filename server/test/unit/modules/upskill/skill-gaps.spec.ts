import type { RequirementCheck } from 'src/modules/matching/rules/types.js';
import { aggregateSkillGaps } from 'src/modules/upskill/utils/skill-gaps.js';

const missing = (label: string, kind: 'SKILL' | 'NICE' = 'SKILL') =>
  ({ label, kind, met: false }) satisfies RequirementCheck;
const have = (label: string) =>
  ({ label, kind: 'SKILL', met: true }) satisfies RequirementCheck;

const job = (id: string, checks: RequirementCheck[]) => ({
  id,
  title: `Tin ${id}`,
  company: 'Công ty',
  checks,
});

const noDictionary = { aliases: new Map<string, string>(), implies: new Map() };
const noNames = new Map<string, string>();

describe('aggregateSkillGaps', () => {
  test('đếm số tin còn thiếu kỹ năng, bỏ kỹ năng đã có và kỹ năng chỉ một tin đòi', () => {
    const gaps = aggregateSkillGaps(
      [
        job('1', [have('Node.js'), missing('GraphQL'), missing('Kafka')]),
        job('2', [have('Node.js'), missing('GraphQL')]),
      ],
      noDictionary,
      noNames,
    );

    expect(gaps.map((gap) => [gap.name, gap.demand])).toEqual([['GraphQL', 2]]);
  });

  /// Tin "gần đạt" = đã khớp ít nhất một nửa kỹ năng bắt buộc. Đo trên dev: hồ sơ backend có 0 tin chỉ thiếu đúng 1 kỹ năng, nên đếm "thứ duy nhất còn thiếu" luôn ra 0.
  test('near đếm tin đã khớp ≥ một nửa kỹ năng bắt buộc mà vẫn thiếu kỹ năng đó', () => {
    const [docker] = aggregateSkillGaps(
      [
        job('1', [have('Node.js'), missing('Docker')]),
        job('2', [missing('Docker'), missing('AWS', 'NICE')]),
        job('3', [have('A'), have('B'), missing('Docker'), missing('K8s')]),
      ],
      noDictionary,
      noNames,
    );

    expect(docker).toMatchObject({ name: 'Docker', demand: 3, near: 2 });
    expect(docker.jobs.map((item) => item.id)).toEqual(['1', '3']);
  });

  test('cách viết khác nhau của cùng một kỹ năng gộp làm một qua danh bạ', () => {
    const dictionary = {
      aliases: new Map([
        ['.net', 'skill-dotnet'],
        ['asp.net core', 'skill-dotnet'],
      ]),
      implies: new Map(),
    };
    const gaps = aggregateSkillGaps(
      [job('1', [missing('.NET')]), job('2', [missing('ASP.NET Core')])],
      dictionary,
      new Map([['skill-dotnet', '.NET']]),
    );

    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({
      key: 'skill-dotnet',
      name: '.NET',
      demand: 2,
    });
  });

  test('kỹ năng phần lớn tin chỉ ghi "ưu tiên" thì nhãn là NICE', () => {
    const [aws] = aggregateSkillGaps(
      [
        job('1', [missing('AWS', 'NICE')]),
        job('2', [missing('AWS', 'NICE')]),
        job('3', [missing('AWS')]),
      ],
      noDictionary,
      noNames,
    );

    expect(aws).toMatchObject({ kind: 'NICE', demand: 3 });
  });

  test('yêu cầu không phải kỹ năng (số năm, địa điểm) không bị tính', () => {
    const years = {
      label: '3 năm kinh nghiệm',
      kind: 'YEARS',
      met: false,
    } as const;

    expect(
      aggregateSkillGaps(
        [job('1', [years]), job('2', [years])],
        noDictionary,
        noNames,
      ),
    ).toEqual([]);
  });
});
