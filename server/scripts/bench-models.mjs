// So sánh các model free trên đúng tác vụ chấm điểm fit.
// Chạy: node bench.mjs
import 'dotenv/config';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateObject, NoObjectGeneratedError } from 'ai';
import { z } from 'zod';

const provider = createOpenAICompatible({
  name: 'opencode',
  baseURL: 'https://opencode.ai/zen/v1',
  apiKey: process.env.AI_API_KEY ?? 'public',
  supportsStructuredOutputs: true,
});

const score = z.number().int().min(0).max(100)
  .describe('Điểm trên thang 0-100. Ví dụ hợp lệ: 85, 62, 40. TUYỆT ĐỐI không dùng thang 0-5 hay 0-10.');
const note = z.string().min(1).max(600)
  .describe('Giải thích ngắn bằng tiếng Việt có dấu, 1-2 câu, nêu bằng chứng cụ thể.');

const schema = z.object({
  eligibility: z.object({
    verdict: z.enum(['PASS', 'FAIL', 'UNVERIFIED']),
    quote: z.string().max(600).default(''),
    note,
  }),
  technical: z.object({ score, note }),
  experience: z.object({ score, note }),
  behavioral: z.object({ score, note }),
  career: z.object({ score, note }),
  location: z.object({ pass: z.boolean(), note }),
  strengths: z.array(z.string().min(1).max(300)).min(1).max(6)
    .describe('2-4 thế mạnh cụ thể, mỗi ý một câu tiếng Việt hoàn chỉnh.'),
  gaps: z.array(z.string().min(1).max(300)).max(6)
    .describe('Yêu cầu tin tuyển dụng mà hồ sơ chưa đáp ứng, mỗi ý một câu tiếng Việt hoàn chỉnh.'),
  recommendation: z.string().min(1).max(800)
    .describe('1-2 câu tiếng Việt: nên ứng tuyển, bỏ qua, hay ứng tuyển kèm lưu ý.'),
});

const system = `Bạn là cố vấn nghề nghiệp. Chấm điểm mức độ phù hợp giữa ứng viên và tin tuyển dụng theo 5 chiều: kỹ thuật, kinh nghiệm, hành vi, định hướng nghề nghiệp, địa điểm.
Chạy Eligibility Gate trước: nếu tin đòi quốc tịch/thường trú mà ứng viên không đáp ứng thì FAIL; nếu tin im lặng về quyền làm việc NHƯNG ứng viên là công dân nước sở tại thì PASS; còn lại UNVERIFIED.
Mỗi điểm chấm trên thang 0-100. KHÔNG tính điểm tổng. Viết tiếng Việt có dấu.`;

const prompt = `=== HỒ SƠ ===
- Chức danh: Senior Frontend Engineer
- Địa điểm: TP. Hồ Chí Minh, Việt Nam
- Quốc tịch: Việt Nam
- Giới thiệu: 5 năm làm frontend, chuyên React và Next.js, từng dẫn dắt nhóm 4 người.
- Kỹ năng chính: React, Next.js, TypeScript, Tailwind CSS
- Kỹ năng phụ: Node.js, GraphQL, Testing Library
- Kỹ năng thiếu: Kubernetes, Rust, Machine Learning
- Kinh nghiệm trực tiếp: Thương mại điện tử, Fintech
- Kinh nghiệm liên quan: Design system, tối ưu hiệu năng web
- Mục tiêu: Trở thành Tech Lead frontend, xây dựng design system quy mô lớn
- Không chấp nhận: chuyển ra Hà Nội

=== TIN TUYỂN DỤNG ===
Senior Frontend Engineer (React/Next.js) tại FPT Software, TP. Hồ Chí Minh, Hybrid, 35-55 triệu/tháng.
Yêu cầu: 4+ năm React, 2+ năm Next.js App Router, TypeScript sâu, tối ưu Core Web Vitals, từng xây design system.
Ưu tiên: GraphQL/Apollo, dẫn dắt nhóm 3+, testing.`;

// Kỳ vọng với hồ sơ này: eligibility PASS (công dân VN, việc ở VN),
// location PASS (cùng TP.HCM), technical và career cao (>=75).
const MODELS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      'deepseek-v4-flash-free',
      'glm-5-free',
      'minimax-m3-free',
      'qwen3.6-plus-free',
      'kimi-k2.5-free',
      'nemotron-3-ultra-free',
      'trinity-large-preview-free',
      'longcat-2.0-free',
    ];

const run = async (modelId) => {
  const startedAt = Date.now();
  try {
    const { object } = await generateObject({
      model: provider(modelId),
      schema,
      system,
      prompt,
      maxRetries: 0,
    });
    const ms = Date.now() - startedAt;

    // Các lỗi ngữ nghĩa mà schema không bắt được.
    const scores = [
      object.technical.score,
      object.experience.score,
      object.behavioral.score,
      object.career.score,
    ];
    const problems = [];
    if (scores.every((s) => s <= 10)) problems.push('dùng thang 0-10 thay vì 0-100');
    if (object.eligibility.verdict !== 'PASS') problems.push(`eligibility=${object.eligibility.verdict} (kỳ vọng PASS)`);
    if (!object.location.pass) problems.push('location=FAIL (kỳ vọng PASS)');
    if (object.technical.score < 70) problems.push(`technical=${object.technical.score} (kỳ vọng >=70)`);
    if (!object.gaps.length) problems.push('gaps rỗng');

    return { modelId, ok: true, ms, scores, object, problems };
  } catch (error) {
    const ms = Date.now() - startedAt;
    const reason = NoObjectGeneratedError.isInstance(error)
      ? 'không khớp schema'
      : String(error.message ?? error).slice(0, 90);
    return { modelId, ok: false, ms, reason };
  }
};

console.log(`Benchmark ${MODELS.length} model free\n`);
const results = await Promise.all(MODELS.map(run));

console.log('| Model                      | KQ  | Giây | Điểm KT/KN/HV/DH | Vấn đề |');
console.log('|----------------------------|-----|------|------------------|--------|');
for (const r of results.sort((a, b) => Number(b.ok) - Number(a.ok) || a.ms - b.ms)) {
  const s = (r.ms / 1000).toFixed(0).padStart(4);
  if (!r.ok) {
    console.log(`| ${r.modelId.padEnd(26)} | LỖI | ${s} | -                | ${r.reason} |`);
  } else {
    const sc = r.scores.join('/').padEnd(16);
    console.log(`| ${r.modelId.padEnd(26)} | OK  | ${s} | ${sc} | ${r.problems.join('; ') || 'không'} |`);
  }
}

const best = results.filter((r) => r.ok && !r.problems.length).sort((a, b) => a.ms - b.ms)[0];
if (best) {
  console.log(`\n=== Kết quả tốt nhất: ${best.modelId} ===`);
  console.log(JSON.stringify(best.object, null, 2));
} else {
  const partial = results.filter((r) => r.ok).sort((a, b) => a.problems.length - b.problems.length)[0];
  if (partial) {
    console.log(`\n=== Ít lỗi nhất: ${partial.modelId} (${partial.problems.length} vấn đề) ===`);
    console.log(JSON.stringify(partial.object, null, 2));
  }
}
