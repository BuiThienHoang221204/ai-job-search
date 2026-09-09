/**
 * Sinh phần đáp án cho câu hỏi đã ở trạng thái READY.
 *
 * Đây là lượt MỒI TRƯỚC, không phải đường chạy chính. Đường chính là sinh lười:
 * người đầu tiên mở một câu thì sinh câu đó rồi cache vĩnh viễn. Script này chỉ
 * để những câu phổ biến nhất đã có sẵn đáp án ngay ngày đầu mở trang, thay vì
 * bắt người dùng đầu tiên ngồi chờ 28 giây.
 *
 * Vì sao không gộp lô như lượt dịch: đầu ra ở đây dài gấp bội (4 trường, riêng
 * `sampleAnswer` đã 4-8 câu). Gộp 20 câu là ép model sinh một khối khổng lồ —
 * nó sẽ cắt ngắn hoặc bỏ bớt trường. Lượt dịch gộp được vì mỗi câu chỉ trả về
 * 3 trường ngắn.
 *
 * `sampleAnswer` BẮT BUỘC null với HANH_VI và DONG_CO. Script chặn ở tầng mã
 * chứ không tin prompt: câu trả lời cho những loại đó phải là trải nghiệm thật
 * của ứng viên, và một câu chuyện bịa lưu sẵn ở đây sẽ bị chính `unsupportedClaims`
 * của mock interview gắn cờ là tuyên bố không có bằng chứng.
 *
 * Cờ:
 *   --limit N        số câu tối đa (mặc định 200)
 *   --concurrency N  số luồng (mặc định 2, để không tranh cổng với lượt dịch)
 */
import 'dotenv/config';
import pg from 'pg';
import { callModel, extractJson, RateLimited, modelChain } from './lib/model-call.mjs';

const { Client } = pg;

const flag = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at >= 0 ? Number(process.argv[at + 1]) : fallback;
};

const LIMIT = flag('--limit', 200);
const CONCURRENCY = flag('--concurrency', 2);

const BASE = process.env.OMNIROUTE_BASE_URL;
const KEY = process.env.OMNIROUTE_API_KEY;
const MODEL = process.env.MODEL_ID;

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL chưa được đặt.');
if (!BASE || !KEY) throw new Error('OMNIROUTE_BASE_URL hoặc OMNIROUTE_API_KEY chưa được đặt.');

const NO_SAMPLE = new Set(['HANH_VI', 'DONG_CO']);

const systemFor = (type) => `Bạn là chuyên gia tuyển dụng người Việt, soạn nội dung cho ngân hàng câu hỏi phỏng vấn dùng ở thị trường Việt Nam.

Bạn nhận một câu hỏi phỏng vấn. Trả về DUY NHẤT một JSON object, không giải thích, không markdown:

- why: 1-2 câu, nhà tuyển dụng hỏi câu này để dò năng lực gì.
- keyPoints: mảng 3-5 chuỗi, mỗi chuỗi là một ý mà câu trả lời tốt phải chạm tới.
- answerGuide: 3-5 câu hướng dẫn cách trả lời, nói về CẤU TRÚC và HƯỚNG tiếp cận.
${
  NO_SAMPLE.has(type)
    ? `- sampleAnswer: BẮT BUỘC là null. Câu này yêu cầu ứng viên kể lại trải nghiệm hoặc động cơ của chính họ, nên không được có đáp án mẫu. Tuyệt đối không bịa ra một câu chuyện cá nhân.`
    : `- sampleAnswer: đáp án mẫu đầy đủ, 4-8 câu, viết như một ứng viên giỏi đang trả lời.`
}

Viết toàn bộ bằng tiếng Việt. Không dùng markdown trong các trường văn bản.`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Ép về chuỗi thay vì từ chối. Model trả `answerGuide` dưới dạng object hoặc
 * mảng khá thường xuyên — đo trên mẻ 200 câu đầu: 25 câu hỏng, phần lớn vì lý
 * do đó, trong khi NỘI DUNG vẫn đủ và đúng. Vứt cả lượt gọi vì sai kiểu là
 * đúng cái bẫy `CLAUDE.md` đã ghi cho schema zod: cắt, đừng từ chối.
 */
function asText(value) {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join(' ');
  if (value && typeof value === 'object') return Object.values(value).map(asText).filter(Boolean).join(' ');
  return '';
}

function asList(value) {
  if (Array.isArray(value)) return value.map(asText).filter(Boolean);
  if (typeof value === 'string') return value.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  if (value && typeof value === 'object') return Object.values(value).map(asText).filter(Boolean);
  return [];
}

async function ask(row) {
  const { text, modelId } = await callModel({
    system: systemFor(row.type),
    user: `Câu hỏi: ${row.text}
Nhóm ngành: ${row.industry}`,
    temperature: 0.3,
  });
  const raw = extractJson(text);
  if (!raw) throw new Error('không phải JSON');

  const obj = {
    why: asText(raw.why),
    keyPoints: asList(raw.keyPoints),
    answerGuide: asText(raw.answerGuide),
    sampleAnswer: asText(raw.sampleAnswer),
  };

  if (obj.why.length < 10) throw new Error('thiếu why');
  if (obj.keyPoints.length < 3) throw new Error('keyPoints < 3');
  if (obj.answerGuide.length < 20) throw new Error('thiếu answerGuide');
  if (!NO_SAMPLE.has(row.type) && obj.sampleAnswer.length < 40) throw new Error('thiếu sampleAnswer');
  return { obj, modelId };
}

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const picked = await client.query(
  `SELECT "id", "text", "industry", "type"::text AS type, "sourcePracticeCount"
     FROM interview_questions
    WHERE "status" = 'READY' AND "answeredAt" IS NULL
    ORDER BY "sourcePracticeCount" DESC, "id"
    LIMIT $1`,
  [LIMIT],
);

const rows = picked.rows;
console.log(`${rows.length} câu cần sinh đáp án · ${CONCURRENCY} luồng`);
console.log(`chuỗi model: ${modelChain().join(' → ')}`);
console.log(`Lượt luyện tập cao nhất trong mẻ: ${rows[0]?.sourcePracticeCount ?? 0}\n`);

const startedAt = Date.now();
let done = 0;
let ok = 0;
let failed = 0;
let pauses = 0;
const MAX_PAUSES = 20;

async function handle(row, queue) {
  let obj;
  let usedModel = MODEL;
  try {
    const result = await ask(row);
    obj = result.obj;
    usedModel = result.modelId;
  } catch (err) {
    if (err instanceof RateLimited) {
      pauses += 1;
      if (pauses > MAX_PAUSES) {
        failed += 1;
        done += 1;
        return;
      }
      const wait = Math.min(err.retryAfterMs, 5 * 60_000);
      console.log(`
  cả chuỗi model đều bị chặn — nghỉ ${(wait / 1000).toFixed(0)}s rồi làm lại câu này`);
      await sleep(wait);
      queue.unshift(row);
      return;
    }
    failed += 1;
    done += 1;
    return;
  }

  const sample = NO_SAMPLE.has(row.type) ? null : obj.sampleAnswer;

  await client.query(
    `UPDATE interview_questions
        SET "why" = $2,
            "keyPoints" = $3,
            "answerGuide" = $4,
            "sampleAnswer" = $5,
            "answeredAt" = NOW(),
            "modelId" = $6,
            "verified" = false,
            "updatedAt" = NOW()
      WHERE "id" = $1`,
    [row.id, obj.why, obj.keyPoints, obj.answerGuide, sample, usedModel],
  );

  ok += 1;
  done += 1;
  const elapsed = (Date.now() - startedAt) / 1000;
  const left = ((rows.length - done) * (elapsed / done)) / 60;
  process.stdout.write(`\r${done}/${rows.length} · xong ${ok} · hỏng ${failed} · còn ~${left.toFixed(0)} phút   `);
}

const queue = [...rows];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const row = queue.shift();
      if (!row) return;
      await handle(row, queue);
    }
  }),
);

console.log('\n');
console.log(`Sinh xong: ${ok}`);
console.log(`Hỏng (vẫn chưa có đáp án): ${failed}`);
console.log(`Thời gian: ${((Date.now() - startedAt) / 60000).toFixed(1)} phút`);

const check = await client.query(
  `SELECT
     COUNT(*) FILTER (WHERE "answeredAt" IS NOT NULL)::int AS da_sinh,
     COUNT(*) FILTER (WHERE "sampleAnswer" IS NOT NULL)::int AS co_dap_an_mau,
     COUNT(*) FILTER (WHERE "answeredAt" IS NOT NULL AND "type" IN ('HANH_VI','DONG_CO') AND "sampleAnswer" IS NOT NULL)::int AS bi_bia
   FROM interview_questions`,
);
const r = check.rows[0];
console.log(`\nTrong kho: ${r.da_sinh} câu đã có đáp án, ${r.co_dap_an_mau} câu có đáp án mẫu`);
console.log(`Câu hành vi bị bịa đáp án: ${r.bi_bia}`);

await client.end();
