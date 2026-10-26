import type { ConfigService } from '@nestjs/config';
import { Prisma } from 'src/generated/prisma/client.js';
import { SkillDictionaryService } from 'src/modules/matching/ai/services/skill-dictionary.service.js';
import type { AiService } from 'src/modules/ai/services/ai.service.js';
import type { PrismaService } from 'src/prisma/prisma.service.js';
import { FakeAi } from 'src/testing/fake-ai.js';
import { FakeSemanticIndex } from 'src/testing/fake-semantic-index.js';

type Alias = { key: string; raw: string; skillId: string; source: string };
type CanonicalRow = {
  id: string;
  name: string;
  vector: number[];
  implies?: string[];
  impliesCheckedAt?: Date;
};

const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError('trùng khoá', {
    code: 'P2002',
    clientVersion: 'test',
  });

/** Bản giả đủ cho đúng các truy vấn service dùng: bảng alias, select/insert `canonical_skills` và `$transaction` có rollback. `takenElsewhere` là khoá một worker khác đã ghi trước — `create` ném P2002 như unique key thật. */
function fakePrisma(
  aliases: Alias[],
  canonicals: CanonicalRow[],
  takenElsewhere: string[] = [],
) {
  let nextId = 1;
  const prisma = {
    aliases,
    canonicals,
    skillAlias: {
      findMany: () =>
        Promise.resolve(aliases.map(({ key, skillId }) => ({ key, skillId }))),
      create: ({ data }: { data: Alias }) => {
        if (takenElsewhere.includes(data.key)) {
          return Promise.reject(uniqueViolation());
        }
        aliases.push(data);
        return Promise.resolve(data);
      },
    },
    canonicalSkill: {
      findMany: ({ where }: { where: { id?: { in: string[] } } }) =>
        Promise.resolve(
          canonicals
            .filter((row) =>
              where.id
                ? where.id.in.includes(row.id) && !row.impliesCheckedAt
                : (row.implies ?? []).length > 0,
            )
            .map((row) => ({
              id: row.id,
              name: row.name,
              implies: row.implies ?? [],
            })),
        ),
      updateMany: ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<CanonicalRow>;
      }) => {
        const row = canonicals.find(
          (item) => item.id === where.id && !item.impliesCheckedAt,
        );
        Object.assign(row ?? {}, data);
        return Promise.resolve({ count: row ? 1 : 0 });
      },
    },
    $transaction: async <T>(run: (tx: unknown) => Promise<T>): Promise<T> => {
      const aliasCount = aliases.length;
      const canonicalCount = canonicals.length;
      try {
        return await run(prisma);
      } catch (error) {
        aliases.length = aliasCount;
        canonicals.length = canonicalCount;
        throw error;
      }
    },
    $queryRawUnsafe: (sql: string, ...params: unknown[]) => {
      if (sql.trimStart().startsWith('insert')) {
        const id = `new-${nextId++}`;
        canonicals.push({
          id,
          name: params[0] as string,
          vector: JSON.parse(params[2] as string) as number[],
        });
        return Promise.resolve([{ id }]);
      }
      return Promise.resolve(
        canonicals.map((row) => ({
          id: row.id,
          name: row.name,
          embedding: JSON.stringify(row.vector),
          aliases: aliases
            .filter((a) => a.skillId === row.id)
            .map((a) => a.raw),
        })),
      );
    },
  };
  return prisma;
}

function build(
  aliases: Alias[] = [],
  canonicals: CanonicalRow[] = [],
  takenElsewhere: string[] = [],
) {
  const prisma = fakePrisma(aliases, canonicals, takenElsewhere);
  const ai = new FakeAi();
  const semantic = new FakeSemanticIndex();
  const config = { get: () => undefined };
  const service = new SkillDictionaryService(
    prisma as unknown as PrismaService,
    ai as unknown as AiService,
    config as unknown as ConfigService,
    semantic,
  );
  return { service, ai, semantic, prisma };
}

/** Kỹ năng chuẩn có vector TRÙNG với vector của `text` — bản giả cho cùng chuỗi ra cùng vector, nên nó luôn lọt vào danh sách ứng viên. */
async function canonicalNear(id: string, name: string, text: string) {
  const [vector] = await new FakeSemanticIndex().embed([text]);
  return { id, name, vector };
}

describe('SkillDictionaryService.ingest', () => {
  test('cách viết đã có trong danh bạ thì không embed, không hỏi model', async () => {
    const { service, ai, semantic } = build([
      { key: 'excel', raw: 'Excel', skillId: 's1', source: 'EXACT' },
    ]);

    expect(await service.ingest(['Excel', 'EXCEL'])).toEqual({
      added: 0,
      remaining: 0,
    });
    expect(semantic.calls).toHaveLength(0);
    expect(ai.calls).toHaveLength(0);
  });

  test('không có ứng viên gần thì tự thành kỹ năng chuẩn mới, KHÔNG gọi model', async () => {
    const { service, ai, prisma } = build();

    expect(await service.ingest(['Kế toán thuế'])).toEqual({
      added: 1,
      remaining: 0,
    });
    expect(ai.calls).toHaveLength(0);
    expect(prisma.canonicals.map((row) => row.name)).toEqual(['Kế toán thuế']);
    expect(prisma.aliases).toEqual([
      expect.objectContaining({
        key: 'ke toan thue',
        skillId: 'new-1',
        source: 'EXACT',
      }),
    ]);
  });

  test('model chọn ứng viên thì gắn alias LLM vào kỹ năng đó, không tạo kỹ năng mới', async () => {
    const { service, ai, prisma } = build(
      [],
      [await canonicalNear('js', 'JS', 'JavaScript')],
    );
    ai.willReturn({ decisions: [{ term: 1, match: 1 }] });

    expect(await service.ingest(['JavaScript'])).toEqual({
      added: 1,
      remaining: 0,
    });
    expect(ai.calls.map((call) => call.purpose)).toEqual([
      'skill.canonicalize',
    ]);
    expect(prisma.canonicals).toHaveLength(1);
    expect(prisma.aliases).toEqual([
      expect.objectContaining({
        key: 'javascript',
        skillId: 'js',
        source: 'LLM',
      }),
    ]);
    expect(ai.pending).toBe(0);
  });

  test('model trả 0 thì là kỹ năng chuẩn mới dù có ứng viên gần', async () => {
    const { service, ai, prisma } = build(
      [],
      [await canonicalNear('js', 'JS', 'JavaScript')],
    );
    ai.willReturn({ decisions: [{ term: 1, match: 0 }] });

    await service.ingest(['JavaScript']);
    expect(prisma.canonicals).toHaveLength(2);
    expect(prisma.aliases[0]).toEqual(
      expect.objectContaining({ source: 'EXACT' }),
    );
  });

  test('model hỏng thì cả lô KHÔNG ghi gì — ghi đại thành kỹ năng mới là vĩnh viễn', async () => {
    const { service, ai, prisma } = build(
      [],
      [await canonicalNear('js', 'JS', 'JavaScript')],
    );
    ai.willFail(new Error('429 rate limited'));

    expect(await service.ingest(['JavaScript'])).toEqual({
      added: 0,
      remaining: 0,
    });
    expect(prisma.aliases).toHaveLength(0);
    expect(prisma.canonicals).toHaveLength(1);
  });

  test('model bỏ sót dòng thì cả lô KHÔNG ghi gì', async () => {
    const { service, ai, prisma } = build(
      [],
      [await canonicalNear('js', 'JS', 'JavaScript')],
    );
    ai.willReturn({ decisions: [] });

    expect(await service.ingest(['JavaScript'])).toEqual({
      added: 0,
      remaining: 0,
    });
    expect(prisma.aliases).toHaveLength(0);
  });

  test('gộp trùng cách viết trong cùng đầu vào và embed MỘT lượt cho cả lô', async () => {
    const { service, semantic } = build();

    await service.ingest(['Excel', 'excel', 'Misa', 'Word']);
    expect(semantic.calls).toEqual([['Excel', 'Misa', 'Word']]);
  });

  test('`maxNew` giới hạn số cách viết xử lý và báo phần còn lại', async () => {
    const { service, semantic } = build();

    expect(await service.ingest(['Excel', 'Misa', 'Word'], 2)).toEqual({
      added: 2,
      remaining: 1,
    });
    expect(semantic.calls).toEqual([['Excel', 'Misa']]);
  });

  test('worker khác đã thêm cùng cách viết thì bỏ qua nó, KHÔNG để lại kỹ năng mồ côi, phần còn lại của lô vẫn ghi', async () => {
    const { service, prisma } = build([], [], ['misa']);

    expect(await service.ingest(['Excel', 'Misa', 'Word'])).toEqual({
      added: 2,
      remaining: 0,
    });
    expect(prisma.canonicals.map((row) => row.name)).toEqual(['Excel', 'Word']);
    expect(prisma.aliases.map((row) => row.key)).toEqual(['excel', 'word']);
  });

  test('alias LLM trùng với lượt khác cũng bỏ qua, không đứt lô', async () => {
    const { service, ai, prisma } = build(
      [],
      [await canonicalNear('js', 'JS', 'JavaScript')],
      ['javascript'],
    );
    ai.willReturn({ decisions: [{ term: 1, match: 1 }] });

    expect(await service.ingest(['JavaScript'])).toEqual({
      added: 0,
      remaining: 0,
    });
    expect(prisma.aliases).toHaveLength(0);
  });

  test('lỗi khác P2002 vẫn ném ra ngoài', async () => {
    const { service, prisma } = build();
    prisma.skillAlias.create = () => Promise.reject(new Error('mất kết nối'));

    await expect(service.ingest(['Excel'])).rejects.toThrow('mất kết nối');
    expect(prisma.canonicals).toHaveLength(0);
  });
});

describe('SkillDictionaryService.inferImplications', () => {
  test('chỉ hỏi kỹ năng hồ sơ chưa hỏi, rồi tra được kỹ năng kéo theo', async () => {
    const excel = await canonicalNear('s-excel', 'Excel', 'Excel');
    const { service, ai, prisma } = build(
      [
        { key: 'react', raw: 'React', skillId: 's-react', source: 'EXACT' },
        { key: 'excel', raw: 'Excel', skillId: 's-excel', source: 'EXACT' },
        {
          key: 'javascript',
          raw: 'JavaScript',
          skillId: 's-js',
          source: 'EXACT',
        },
      ],
      [
        await canonicalNear('s-react', 'React', 'React'),
        {
          ...excel,
          implies: ['tin hoc van phong'],
          impliesCheckedAt: new Date(),
        },
        await canonicalNear('s-js', 'JavaScript', 'JavaScript'),
      ],
    );
    ai.willReturn({ skills: [{ index: 1, implies: ['JavaScript'] }] });

    expect(await service.inferImplications(['React', 'Excel'])).toBe(1);
    expect(ai.calls.map((call) => call.purpose)).toEqual(['skill.implies']);
    expect(prisma.canonicals[0].implies).toEqual(['javascript']);
    expect((await service.lookup()).implies.get('s-react')).toEqual(
      new Set(['s-js']),
    );
  });
});
