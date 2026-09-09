/**
 * Nhập ngân hàng câu hỏi đã thu về vào bảng `interview_questions`.
 *
 * Chạy lại được: khoá `(source, sourceId)` cộng `ON CONFLICT DO NOTHING` nên
 * chạy hai lần không nhân đôi dữ liệu. Cố ý KHÔNG dùng `DO UPDATE`: câu đã qua
 * lượt dịch và phân loại thì `text`/`industry`/`type` là công đã bỏ ra, một lượt
 * nhập lại vô ý không được phép xoá chúng về `null`.
 *
 * Mọi bản ghi vào ở trạng thái RAW, mà trang danh sách chỉ đọc READY — nhập về
 * xong vẫn chưa có gì lộ ra web.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';

const { Client } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL chưa được đặt. Hãy tạo server/.env từ .env.example.');
}

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const INPUT = process.argv[2] ?? path.join(HERE, 'data/clean.jsonl');
const CHUNK = 500;

const rows = fs
  .readFileSync(INPUT, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line));

console.log(`${rows.length} câu trong ${path.basename(INPUT)}`);

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

let inserted = 0;

for (let at = 0; at < rows.length; at += CHUNK) {
  const chunk = rows.slice(at, at + CHUNK);
  const values = [];
  const params = [];

  chunk.forEach((row, i) => {
    const base = i * 6;
    values.push(
      `($${base + 1}, 'X_INTERVIEW', $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, 'RAW', $${base + 6}, NOW(), NOW())`,
    );
    params.push(
      crypto.randomUUID(),
      String(row.sourceId),
      row.text,
      row.difficulty ?? null,
      row.practiceCount ?? 0,
      row.lang === 'vi' ? row.text : null,
    );
  });

  const result = await client.query(
    `INSERT INTO interview_questions
       ("id", "source", "sourceId", "sourceText", "difficulty", "sourcePracticeCount", "status", "text", "createdAt", "updatedAt")
     VALUES ${values.join(', ')}
     ON CONFLICT ("source", "sourceId") DO NOTHING`,
    params,
  );

  inserted += result.rowCount;
  console.log(`  ${Math.min(at + CHUNK, rows.length)}/${rows.length} — thêm ${inserted}`);
}

const summary = await client.query(
  `SELECT "status", COUNT(*)::int AS n,
          COUNT("text")::int AS co_tieng_viet
     FROM interview_questions
    GROUP BY "status"`,
);

console.log('');
for (const row of summary.rows) {
  console.log(`${row.status}: ${row.n} câu, ${row.co_tieng_viet} câu đã có tiếng Việt`);
}

await client.end();
console.log(`\nXong: thêm mới ${inserted} câu.`);
