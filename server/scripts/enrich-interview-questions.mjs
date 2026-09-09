/**
 * Lượt sinh TRƯỚC cho ngân hàng câu hỏi: dịch sang tiếng Việt, gán nhóm ngành,
 * phân loại, và loại thứ không phải câu hỏi.
 *
 * Gộp 20 câu vào một lượt gọi model. Đo thật trên `oc/mimo-v2.5-free`: gọi từng
 * câu mất 27,8 giây, gộp lô còn 2,3 giây mỗi câu — nhanh gấp 12 lần. Lô là đơn
 * vị ghi, hỏng cả lô thì cả lô ở nguyên RAW và lượt chạy sau nhặt lại.
 *
 * KHÔNG sinh đáp án ở đây. `why`/`keyPoints`/`answerGuide`/`sampleAnswer` sinh
 * lười lúc người đầu tiên mở câu đó — 91% câu trong kho nguồn chưa ai từng
 * luyện, sinh trước là trả giá cho thứ không ai xem.
 *
 * Cờ:
 *   --limit N   số câu tối đa (mặc định chạy hết RAW)
 *   --batch N   số câu mỗi lượt gọi (mặc định 20)
 */
import 'dotenv/config';
import pg from 'pg';
import { callModel, extractJson, RateLimited, modelChain } from './lib/model-call.mjs';

const { Client } = pg;

const flag = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at >= 0 ? Number(process.argv[at + 1]) : fallback;
};

const LIMIT = flag('--limit', Infinity);
const BATCH = flag('--batch', 20);
const CONCURRENCY = 3;

const BASE = process.env.OMNIROUTE_BASE_URL;
const KEY = process.env.OMNIROUTE_API_KEY;
const MODEL = process.env.MODEL_ID;

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL chưa được đặt.');
if (!BASE || !KEY) throw new Error('OMNIROUTE_BASE_URL hoặc OMNIROUTE_API_KEY chưa được đặt.');

const INDUSTRIES = [
  'DATA_AI', 'IT', 'DESIGN', 'MARKETING', 'SALES', 'CUSTOMER', 'FINANCE', 'HR',
  'MANUFACTURING', 'CONSTRUCTION', 'LOGISTICS', 'HEALTHCARE', 'EDUCATION',
  'HOSPITALITY', 'RETAIL', 'AGRICULTURE', 'MANUAL', 'OTHER',
];
const TYPES = ['KIEN_THUC', 'QUY_TRINH', 'HANH_VI', 'DONG_CO'];

const SYSTEM = `Bạn là chuyên gia tuyển dụng người Việt. Bạn nhận một danh sách câu hỏi phỏng vấn đã đánh số.

Với MỖI câu, trả về một object gồm:
- i: số thứ tự của câu, đúng như đầu vào
- isQuestion: true nếu đây thật sự là một câu hỏi phỏng vấn hỏi được cho một ứng viên.
  Trả false khi đầu vào chỉ là một cái nhãn ("Mục tiêu nghề nghiệp", "Tối ưu hiệu năng"),
  một đoạn mô tả công việc, hoặc nhiều câu hỏi nhồi vào một dòng.
- questionVi: câu hỏi bằng tiếng Việt tự nhiên như một nhà tuyển dụng Việt Nam thật sự sẽ hỏi.
  Nếu đầu vào đã là tiếng Việt thì sửa lỗi chính tả rồi giữ nguyên ý. KHÔNG dịch máy từng chữ.
  Để chuỗi rỗng khi isQuestion là false.
- industry: đúng một mã trong ${INDUSTRIES.join(', ')}
- type: ${TYPES[0]} (kiến thức có đáp án đúng) | ${TYPES[1]} (cách làm, phương pháp) | ${TYPES[2]} (kể lại trải nghiệm thật) | ${TYPES[3]} (động cơ, nguyện vọng)

Trả về DUY NHẤT một JSON array đủ số object bằng số câu đầu vào. Không giải thích, không markdown.`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ask(rows) {
  const { text, modelId } = await callModel({
    system: SYSTEM,
    temperature: 0.2,
    user: rows.map((r, i) => `${i + 1}. ${r.sourceText}`).join('\n'),
  });
  const parsed = extractJson(text, '[', ']');
  if (!Array.isArray(parsed)) throw new Error('không trả về mảng');
  return { parsed, modelId };
}

const CODES = new Set(INDUSTRIES);
const KINDS = new Set(TYPES);

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const total = await client.query(`SELECT COUNT(*)::int AS n FROM interview_questions WHERE "status" = 'RAW'`);
const rawCount = total.rows[0].n;
const take = Math.min(LIMIT, rawCount);
const step = Math.max(1, Math.floor(rawCount / take));

const picked = await client.query(
  `SELECT "id", "sourceText", "sourceId"
     FROM (
       SELECT "id", "sourceText", "sourceId",
              ROW_NUMBER() OVER (ORDER BY ("sourceId")::int) AS rn
         FROM interview_questions
        WHERE "status" = 'RAW'
     ) numbered
    WHERE (rn - 1) % $1 = 0
    LIMIT $2`,
  [step, take],
);

const rows = picked.rows;
console.log(`RAW trong kho: ${rawCount} · lấy ${rows.length} câu (cách quãng mỗi ${step})`);
console.log(`chuỗi model: ${modelChain().join(' → ')}`);
console.log(`lô ${BATCH} câu · ${CONCURRENCY} luồng\n`);

const batches = [];
for (let at = 0; at < rows.length; at += BATCH) batches.push(rows.slice(at, at + BATCH));

const startedAt = Date.now();
let ready = 0;
let rejected = 0;
let failed = 0;
let doneBatches = 0;
let pauses = 0;
const MAX_PAUSES = 20;

async function handle(batch, queue) {
  let parsed;
  let usedModel = MODEL;
  try {
    const result = await ask(batch);
    parsed = result.parsed;
    usedModel = result.modelId;
  } catch (err) {
    if (err instanceof RateLimited) {
      pauses += 1;
      if (pauses > MAX_PAUSES) {
        failed += batch.length;
        return;
      }
      const wait = Math.min(err.retryAfterMs, 5 * 60_000);
      console.log(`\n  cả chuỗi model đều bị chặn — nghỉ ${(wait / 1000).toFixed(0)}s rồi làm lại lô này`);
      await sleep(wait);
      queue.unshift(batch);
      return;
    }
    failed += batch.length;
    console.log(`\n  lô hỏng (${batch.length} câu): ${err.message}`);
    return;
  }

  const byIndex = new Map(parsed.map((o) => [Number(o.i), o]));
  const updates = [];

  batch.forEach((row, i) => {
    const got = byIndex.get(i + 1);
    if (!got) {
      failed += 1;
      return;
    }
    if (got.isQuestion === false) {
      updates.push([row.id, 'REJECTED', null, null, null]);
      rejected += 1;
      return;
    }
    const okText = typeof got.questionVi === 'string' && got.questionVi.trim().length >= 5;
    if (!okText || !CODES.has(got.industry) || !KINDS.has(got.type)) {
      failed += 1;
      return;
    }
    updates.push([row.id, 'READY', got.questionVi.trim(), got.industry, got.type]);
    ready += 1;
  });

  for (const [id, status, text, industry, type] of updates) {
    await client.query(
      `UPDATE interview_questions
          SET "status" = $2::"InterviewQuestionStatus",
              "text" = COALESCE($3, "text"),
              "industry" = $4,
              "type" = $5::"InterviewQuestionType",
              "modelId" = $6,
              "updatedAt" = NOW()
        WHERE "id" = $1`,
      [id, status, text, industry, type, usedModel],
    );
  }

  doneBatches += 1;
  const elapsed = (Date.now() - startedAt) / 1000;
  const perBatch = elapsed / doneBatches;
  const left = ((batches.length - doneBatches) * perBatch) / 60;
  process.stdout.write(
    `\rlô ${doneBatches}/${batches.length} · READY ${ready} · loại ${rejected} · hỏng ${failed} · còn ~${left.toFixed(0)} phút   `,
  );
}

const queue = [...batches];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const batch = queue.shift();
      if (!batch) return;
      await handle(batch, queue);
    }
  }),
);

console.log('\n');
console.log(`READY:  ${ready}`);
console.log(`REJECTED (không phải câu hỏi): ${rejected}`);
console.log(`Hỏng, vẫn ở RAW: ${failed}`);
console.log(`Thời gian: ${((Date.now() - startedAt) / 60000).toFixed(1)} phút`);

const dist = await client.query(
  `SELECT "industry", COUNT(*)::int AS n
     FROM interview_questions
    WHERE "status" = 'READY'
    GROUP BY "industry"
    ORDER BY n DESC`,
);
console.log('\nPhân bố ngành:');
for (const row of dist.rows) console.log(`  ${row.industry}: ${row.n}`);

const kinds = await client.query(
  `SELECT "type", COUNT(*)::int AS n
     FROM interview_questions
    WHERE "status" = 'READY'
    GROUP BY "type"
    ORDER BY n DESC`,
);
console.log('\nPhân bố loại:');
for (const row of kinds.rows) console.log(`  ${row.type}: ${row.n}`);

await client.end();
