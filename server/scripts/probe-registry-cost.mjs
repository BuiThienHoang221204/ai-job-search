/**
 * Đo chi phí dựng danh bạ kỹ năng trên dữ liệu THẬT.
 *
 * Embedding chỉ thu hẹp ứng viên, LLM mới quyết định. Script này trả lời câu
 * hỏi quyết định việc có xây tiếp hay không: với ngưỡng thu hẹp đã chọn, LLM
 * phải phán bao nhiêu cặp.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { env, pipeline } from '@huggingface/transformers';
import { PrismaClient } from '../dist/generated/prisma/client.js';

const MODEL = 'Xenova/multilingual-e5-base';
const THRESHOLD = Number(process.env.PROBE_THRESHOLD ?? 0.7);
const TOP_K = 5;
const BATCH = 64;

env.allowLocalModels = false;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const fold = (value) =>
  value
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();

async function main() {
  const [requirements, profiles] = await Promise.all([
    prisma.jobRequirement.findMany({
      where: { status: 'DONE' },
      select: { requiredSkills: true, niceToHaveSkills: true },
    }),
    prisma.profile.findMany({
      select: { primarySkills: true, secondarySkills: true, headline: true },
    }),
  ]);

  const seen = new Map();
  const add = (raw) => {
    const key = fold(raw);
    if (key.length >= 2 && !seen.has(key)) seen.set(key, raw);
  };
  for (const row of requirements) {
    for (const skill of [...row.requiredSkills, ...row.niceToHaveSkills]) {
      add(skill);
    }
  }
  for (const row of profiles) {
    for (const skill of [
      ...row.primarySkills,
      ...row.secondarySkills,
      ...(row.headline ? [row.headline] : []),
    ]) {
      add(skill);
    }
  }

  const terms = [...seen.values()];
  console.log(`${terms.length} chuỗi kỹ năng duy nhất\n`);

  const extract = await pipeline('feature-extraction', MODEL, { dtype: 'q8' });

  const vectors = [];
  const startedAt = Date.now();
  for (let i = 0; i < terms.length; i += BATCH) {
    const slice = terms.slice(i, i + BATCH);
    const output = await extract(
      slice.map((term) => `query: ${term}`),
      { pooling: 'mean', normalize: true },
    );
    vectors.push(...output.tolist());
    process.stdout.write(`\r  embed ${vectors.length}/${terms.length}`);
  }
  const elapsed = (Date.now() - startedAt) / 1000;
  console.log(
    `\n  xong sau ${elapsed.toFixed(1)}s (${((elapsed * 1000) / terms.length).toFixed(0)}ms/chuỗi)`,
  );
  console.log(
    `  RAM: ${(process.memoryUsage().rss / 1024 / 1024).toFixed(0)}MB\n`,
  );

  const dot = (a, b) => {
    let sum = 0;
    for (let i = 0; i < a.length; i += 1) sum += a[i] * b[i];
    return sum;
  };

  let pairsAboveThreshold = 0;
  const buckets = new Map();
  const samples = [];

  for (let i = 0; i < terms.length; i += 1) {
    const near = [];
    for (let j = 0; j < terms.length; j += 1) {
      if (i === j) continue;
      const score = dot(vectors[i], vectors[j]);
      if (score >= THRESHOLD) near.push({ term: terms[j], score });
    }
    pairsAboveThreshold += near.length;

    const shortlisted = Math.min(near.length, TOP_K);
    buckets.set(shortlisted, (buckets.get(shortlisted) ?? 0) + 1);

    if (near.length && samples.length < 12) {
      near.sort((a, b) => b.score - a.score);
      samples.push(
        `  ${terms[i]}  ->  ${near
          .slice(0, 3)
          .map((n) => `${n.term} (${n.score.toFixed(2)})`)
          .join(', ')}`,
      );
    }
  }

  console.log(`Ngưỡng thu hẹp: ${THRESHOLD}`);
  console.log(
    `Cặp vượt ngưỡng (đếm hai chiều): ${pairsAboveThreshold}, tức ${pairsAboveThreshold / 2} cặp thật\n`,
  );

  console.log('Số ứng viên LLM phải xem cho mỗi chuỗi (đã cắt top-5):');
  let llmCalls = 0;
  for (const count of [...buckets.keys()].sort((a, b) => a - b)) {
    const strings = buckets.get(count);
    console.log(`  ${count} ứng viên: ${strings} chuỗi`);
    if (count > 0) llmCalls += strings;
  }

  console.log(`\nSố chuỗi cần LLM phán: ${llmCalls}/${terms.length}`);
  console.log(`Gộp lô 20 chuỗi/lượt gọi -> ~${Math.ceil(llmCalls / 20)} lượt gọi model`);
  console.log(`Với p50 33 giây -> ~${((Math.ceil(llmCalls / 20) * 33) / 60).toFixed(0)} phút, chạy MỘT lần`);

  console.log('\nVài ví dụ thu hẹp được:');
  for (const line of samples) console.log(line);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
