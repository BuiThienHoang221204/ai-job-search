/**
 * Đo A/B prompt chấm điểm: khung ĐÃ ĐIỀN hồ sơ (`render`, bản cũ) và khung DÙNG CHUNG (`renderShared`, bản mới).
 *
 * Trả lời hai câu hỏi, cả hai qua đúng `AiService` như production:
 *   1. Chất lượng có đổi không — so chênh lệch cũ↔mới với độ dao động tự nhiên cũ↔cũ.
 *   2. Cache có tăng không — đọc `cachedTokens` của từng lượt trong `ai_calls`.
 *
 * KHÔNG ghi vào `job_matches`. Lượt gọi ghi `ai_calls` với purpose `match.evaluate.probe`.
 *
 * Chạy (cần `pnpm build` trước):
 *   node scripts/probe-prompt-cache.mjs --dry          # không gọi model: in cỡ prompt, kiểm system giống nhau
 *   node scripts/probe-prompt-cache.mjs --n 5          # 5 cặp x 3 lượt = 15 lượt gọi
 *   node scripts/probe-prompt-cache.mjs --n 5 --skip 5 # đợt 2, cặp thứ 6-10 (bể free cạn sau ~30 lượt)
 *   node scripts/probe-prompt-cache.mjs --model opencode/ling-3.0-flash-fin-free
 */
process.env.APP_ROLE = 'api';

import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/app.module.js';
import { AiService } from '../dist/modules/ai/services/ai.service.js';
import { PrismaService } from '../dist/prisma/prisma.service.js';
import { PromptBuilderService } from '../dist/modules/skills/services/prompt-builder.service.js';
import { SkillRegistryService } from '../dist/modules/skills/services/skill-registry.service.js';
import {
  EVALUATION_SECTIONS,
  evaluationPrompt,
} from '../dist/modules/matching/ai/prompt/evaluation.prompt.js';
import {
  computeOverall,
  evaluationSchema,
  verdictFor,
} from '../dist/modules/matching/ai/schemas/evaluation.schema.js';

const PURPOSE = 'match.evaluate.probe';

const arg = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : fallback;
};
const N = Number(arg('--n', '5'));
const SKIP = Number(arg('--skip', '0'));
const MODEL_ID = arg('--model', undefined);
const DRY = process.argv.includes('--dry');

/** Tối đa 2 cặp mỗi người dùng: đo xuyên người dùng mới là điểm của bản mới. */
async function pickPairs(prisma) {
  const rows = await prisma.jobMatch.findMany({
    where: { status: 'DONE' },
    select: { userId: true, jobId: true },
    orderBy: [{ userId: 'asc' }, { evaluatedAt: 'desc' }],
  });
  const perUser = new Map();
  for (const row of rows) {
    const list = perUser.get(row.userId) ?? [];
    if (list.length < 2) perUser.set(row.userId, [...list, row]);
  }
  // Xen kẽ vòng tròn để hai cặp liền nhau thuộc hai NGƯỜI KHÁC — đúng ca cache bản cũ không ăn được.
  const picked = [];
  for (let round = 0; round < 2; round += 1) {
    for (const list of perUser.values()) if (list[round]) picked.push(list[round]);
  }
  return picked.slice(SKIP, SKIP + N);
}

function buildBoth(skills, prompts, profile, job) {
  const skill = skills.get('job-application-assistant');
  const selected = prompts.dropSubsection(
    prompts.keepSections(skill.references.get('04-job-evaluation.md') ?? '', EVALUATION_SECTIONS),
    'Salary Benchmark',
  );
  const summary = prompts.profileSummary(profile);
  return {
    old: evaluationPrompt(prompts.render(selected, profile), summary, job),
    shared: evaluationPrompt(prompts.renderShared(selected), summary, job),
  };
}

async function run(ai, prisma, userId, { system, prompt }) {
  const startedAt = new Date();
  const { object, modelId } = await ai.generateObject({
    schema: evaluationSchema,
    context: { purpose: PURPOSE, userId },
    system,
    prompt,
    ...(MODEL_ID ? { modelId: MODEL_ID } : {}),
  });
  const call = await prisma.aiCall.findFirst({
    where: { purpose: PURPOSE, ok: true, createdAt: { gte: startedAt } },
    orderBy: { createdAt: 'desc' },
  });
  const overall = object.eligibility.verdict === 'FAIL' ? 0 : computeOverall(object);
  return {
    modelId,
    eligibility: object.eligibility.verdict,
    scores: [object.technical.score, object.experience.score, object.behavioral.score, object.career.score],
    overall,
    verdict: object.eligibility.verdict === 'FAIL' ? 'POOR' : verdictFor(overall),
    input: call?.inputTokens ?? null,
    cached: call?.cachedTokens ?? 0,
    ms: call?.durationMs ?? null,
  };
}

const pct = (r) => (r.input ? Math.round((100 * r.cached) / r.input) : 0);
const line = (tag, r) =>
  `  ${tag.padEnd(5)} ${r.eligibility.padEnd(10)} ${r.verdict.padEnd(9)} tổng=${String(r.overall).padStart(3)}  ` +
  `[${r.scores.map((s) => String(s).padStart(3)).join(' ')}]  vào=${r.input} cache=${r.cached} (${pct(r)}%)  ${r.ms}ms  ${r.modelId}`;

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const ai = app.get(AiService);
  const prisma = app.get(PrismaService);
  const skills = app.get(SkillRegistryService);
  const prompts = app.get(PromptBuilderService);

  const pairs = await pickPairs(prisma);
  console.log(`\n${pairs.length} cặp, ${new Set(pairs.map((p) => p.userId)).size} người dùng${DRY ? ' (--dry: không gọi model)' : `, ${pairs.length * 3} lượt gọi model`}\n`);

  const systems = new Set();
  const results = [];
  for (const [i, pair] of pairs.entries()) {
    const [profile, job] = await Promise.all([
      prisma.profile.findUnique({ where: { userId: pair.userId } }),
      prisma.job.findUnique({ where: { id: pair.jobId } }),
    ]);
    if (!job) continue;
    const { old, shared } = buildBoth(skills, prompts, profile, job);
    systems.add(shared.system);
    console.log(`[${i + 1}] user=${pair.userId.slice(0, 8)} job=${job.title.slice(0, 50)}`);
    console.log(`  system cũ ${old.system.length} ký tự, mới ${shared.system.length}; prompt ${shared.prompt.length}`);
    if (DRY) continue;

    try {
      const a = await run(ai, prisma, pair.userId, old);
      console.log(line('cũ-1', a));
      const b = await run(ai, prisma, pair.userId, old);
      console.log(line('cũ-2', b));
      const n = await run(ai, prisma, pair.userId, shared);
      console.log(line('mới', n));
      results.push({ a, b, n });
    } catch (error) {
      console.log(`  HỎNG: ${error instanceof Error ? error.message.slice(0, 200) : error}`);
    }
  }

  console.log(`\nSystem prompt bản mới: ${systems.size} biến thể trên ${pairs.length} cặp (mong đợi: 1)`);
  if (!results.length) return app.close();

  const mean = (xs) => (xs.length ? (xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(1) : '-');
  const noise = results.map(({ a, b }) => Math.abs(a.overall - b.overall));
  const drift = results.map(({ a, b, n }) => Math.abs(n.overall - (a.overall + b.overall) / 2));
  const flipsNoise = results.filter(({ a, b }) => a.verdict !== b.verdict).length;
  const flipsNew = results.filter(({ a, b, n }) => n.verdict !== a.verdict && n.verdict !== b.verdict).length;
  const eligibility = results.filter(({ a, n }) => a.eligibility !== n.eligibility).length;

  console.log(`\n=== KẾT QUẢ (${results.length} cặp) ===`);
  console.log(`Dao động tự nhiên |cũ-1 - cũ-2|      trung bình ${mean(noise)} điểm, verdict lệch ${flipsNoise}/${results.length}`);
  console.log(`Chênh lệch |mới - trung bình cũ|     trung bình ${mean(drift)} điểm, verdict khác CẢ HAI lượt cũ ${flipsNew}/${results.length}`);
  console.log(`Eligibility khác nhau cũ↔mới          ${eligibility}/${results.length}  (mong đợi: 0)`);
  // `cũ-2` gửi lại ĐÚNG prompt của `cũ-1` nên luôn cache ~100%; tính nó vào là thổi phồng bản cũ.
  console.log(`Cache lần đầu thấy prompt: cũ-1 ${mean(results.map(({ a }) => pct(a)))}%, mới ${mean(results.map(({ n }) => pct(n)))}%  (cũ-2 là gửi lại y hệt, không tính)`);
  console.log(`\nĐẠT khi: eligibility 0 khác, chênh lệch mới ≤ dao động tự nhiên (cộng biên nhỏ), verdict không lệch nhiều hơn dao động.`);
  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
