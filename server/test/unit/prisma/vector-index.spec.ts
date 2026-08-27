import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Canh index HNSW của pgvector không bị một migration sau xoá mất.
 *
 * Index đó được tạo bằng SQL viết tay vì Prisma không có kiểu `vector`, nên nó
 * KHÔNG tồn tại trong `schema.prisma`. Hệ quả: mọi lần `prisma migrate dev` so
 * schema với database đều coi nó là dư thừa và sinh ra một dòng
 * `DROP INDEX "job_embeddings_embedding_idx"`.
 *
 * Chín migration đầu gỡ được dòng đó bằng tay. Migration thứ mười
 * (`20260825035410_add_viewed_status`) để lọt, và index bị xoá thật từ
 * 2026-08-25 tới 2026-08-26 mà KHÔNG có gì báo - truy vấn ngữ nghĩa vẫn trả kết
 * quả đúng, chỉ quét toàn bảng thay vì dùng index.
 *
 * Test này thay cho trí nhớ: với mỗi index vector, câu lệnh CUỐI CÙNG nhắc tới
 * nó (xét theo thứ tự tên thư mục migration) phải là CREATE, không được là DROP.
 * Nhờ vậy một `DROP` đã áp rồi vẫn hợp lệ miễn là có migration sau dựng lại,
 * còn một `DROP` mới thêm vào cuối lịch sử thì đỏ ngay.
 */
const MIGRATIONS_DIR = join(__dirname, '../../../prisma/migrations');

type Statement = { migration: string; kind: 'CREATE' | 'DROP' };

const stripComments = (sql: string): string =>
  sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');

const collect = (): Map<string, Statement[]> => {
  const byIndex = new Map<string, Statement[]>();
  const migrations = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const migration of migrations) {
    let sql: string;
    try {
      sql = readFileSync(
        join(MIGRATIONS_DIR, migration, 'migration.sql'),
        'utf8',
      );
    } catch {
      continue;
    }

    const body = stripComments(sql);
    const patterns: Array<[RegExp, Statement['kind']]> = [
      [
        /CREATE\s+INDEX(?:\s+IF\s+NOT\s+EXISTS)?\s+"([^"]+)"[^;]*USING\s+(?:hnsw|ivfflat)/gi,
        'CREATE',
      ],
      [/DROP\s+INDEX(?:\s+IF\s+EXISTS)?\s+"([^"]+)"/gi, 'DROP'],
    ];

    for (const [pattern, kind] of patterns) {
      for (const match of body.matchAll(pattern)) {
        const name = match[1];
        byIndex.set(name, [...(byIndex.get(name) ?? []), { migration, kind }]);
      }
    }
  }
  return byIndex;
};

describe('index vector của pgvector', () => {
  const statements = collect();

  const vectorIndexes = [...statements.entries()].filter(([, rows]) =>
    rows.some((row) => row.kind === 'CREATE'),
  );

  it('có ít nhất một index vector trong lịch sử migration', () => {
    expect(vectorIndexes.length).toBeGreaterThan(0);
  });

  it.each(vectorIndexes)(
    '%s kết thúc bằng CREATE, không phải DROP',
    (name, rows) => {
      const last = rows[rows.length - 1];
      expect({
        index: name,
        migration: last.migration,
        kind: last.kind,
      }).toEqual({ index: name, migration: last.migration, kind: 'CREATE' });
    },
  );
});
