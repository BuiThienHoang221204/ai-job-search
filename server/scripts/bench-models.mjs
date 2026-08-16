// So sánh các model trên đúng tác vụ chấm điểm fit, trên NHIỀU lõi.
//
// Chạy:
//   node scripts/bench-models.mjs                                   # model free của lõi mặc định
//   node scripts/bench-models.mjs openrouter/openai/gpt-oss-20b:free deepseek-v4-flash-free
//
// Mắt xích viết như trong MODEL_FALLBACK_IDS: `lõi/model`, hoặc chỉ `model` cho
// lõi mặc định.
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateObject, NoObjectGeneratedError } from 'ai';
import { z } from 'zod';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Các lõi script này gọi được. Giữ khớp với `src/modules/ai/providers/`; đây là
 * bản sao vì script chạy bằng node trần, không nạp được TypeScript của app.
 */
const PROVIDERS = {
  opencode: {
    baseURL: 'https://opencode.ai/zen/v1',
    apiKey: () => process.env.AI_API_KEY ?? 'public',
  },
  openrouter: {
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: () => process.env.OPENROUTER_API_KEY ?? '',
  },
  // ỨNG VIÊN đang cân nhắc, CHƯA phải một lõi của app — cố ý chưa có trong
  // src/modules/ai/providers/. Đã đo: gateway này nhận request KHÔNG cần key.
  kilo: {
    baseURL: 'https://api.kilo.ai/api/gateway',
    apiKey: () => process.env.KILO_API_KEY ?? 'khong-can-key',
  },
};

const DEFAULT_PROVIDER = process.env.MODEL_PROVIDER ?? 'opencode';

/** Tách ở dấu / ĐẦU TIÊN — model id của OpenRouter tự nó có dấu /. */
const parseRef = (raw) => {
  const value = raw.trim();
  const slash = value.indexOf('/');
  if (slash > 0) {
    const prefix = value.slice(0, slash);
    const rest = value.slice(slash + 1);
    if (rest && PROVIDERS[prefix]) return { providerId: prefix, modelId: rest };
  }
  return { providerId: DEFAULT_PROVIDER, modelId: value };
};

const clientFor = (providerId) => {
  const spec = PROVIDERS[providerId];
  if (!spec) throw new Error(`Không biết lõi: ${providerId}`);
  return createOpenAICompatible({
    name: providerId,
    baseURL: spec.baseURL,
    apiKey: spec.apiKey(),
    supportsStructuredOutputs: true,
  });
};

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

/**
 * Giữ lại một số mục `##` của file skill. Bản sao rút gọn của
 * `PromptBuilderService.keepSections` — script chạy bằng node trần nên không
 * nạp được TypeScript của app.
 */
const keepSections = (markdown, headings) => {
  const wanted = headings.map((h) => h.toLowerCase());
  return markdown
    .split(/^## /m)
    .slice(1)
    .filter((block) =>
      wanted.some((h) => block.split('\n', 1)[0].trim().toLowerCase().startsWith(h)),
    )
    .map((block) => `## ${block.trimEnd()}`)
    .join('\n\n');
};

/**
 * KHUNG ĐÁNH GIÁ THẬT, đọc từ chính file mà `MatchingService` nạp lúc chạy.
 *
 * Đây là điểm quan trọng nhất của script, và nó sửa một BẪY ĐO đã sập một lần:
 * bản cũ dùng một system prompt ba dòng tự chế, nên `nemotron-3.5-lightning`
 * xong trong 12,4 giây và bị kết luận là "dùng được". Prompt thật của app mang
 * theo cả khung này và nó hết giờ ở mốc 90 giây. Đo bằng prompt nhỏ là đo một
 * tác vụ khác.
 */
const framework = keepSections(
  readFileSync(
    join(HERE, '../../.claude/skills/job-application-assistant/04-job-evaluation.md'),
    'utf8',
  ),
  ['eligibility gate', 'scoring dimensions', 'weighting', 'thresholds'],
);

const system = `Bạn là cố vấn nghề nghiệp, đánh giá mức độ phù hợp giữa một ứng viên và một tin tuyển dụng.
Áp dụng ĐÚNG khung đánh giá dưới đây. Không tự bịa thêm chiều đánh giá mới.

Quy tắc bắt buộc:
- Chạy Eligibility Gate TRƯỚC: tin đòi quốc tịch/thường trú mà ứng viên không đáp ứng -> FAIL; ứng viên là công dân nước sở tại -> PASS; còn lại UNVERIFIED.
- MỌI điểm đều chấm trên thang 0-100. Không dùng thang 0-5 hay 0-10.
- KHÔNG tính điểm tổng. Hệ thống tự tính theo trọng số.
- Mọi ghi chú phải là MỘT CÂU tiếng Việt có dấu hoàn chỉnh.

--- KHUNG ĐÁNH GIÁ ---
${framework}`;

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

/** Gom mọi chuỗi trong kết quả để soi chất lượng chữ. */
const allText = (value) => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(allText).join(' ');
  if (value && typeof value === 'object') return Object.values(value).map(allText).join(' ');
  return '';
};

/**
 * Model yếu hay trộn chữ của ngôn ngữ khác vào giữa câu tiếng Việt. Đã bắt được
 * thật: `nemotron-nano-9b-v2` trả về "ph السياسة" và "transacción" trong khi
 * schema vẫn khớp hoàn toàn — nghĩa là structured output ĐẠT mà kết quả vẫn
 * không dùng được. Không có kiểm tra này thì bench chấm nó là "tốt nhất".
 */
const foreignScript = (text) => {
  const found = [...new Set(text.match(/[^\p{Script=Latin}\p{Nd}\p{P}\p{Zs}\p{S}\n]/gu) ?? [])];
  return found.length ? found.slice(0, 6).join('') : null;
};

/**
 * Một câu tiếng Việt hoàn chỉnh gần như luôn có ít nhất một chữ có dấu. Không
 * có dấu nào mà vẫn dài thì hoặc là tiếng Anh, hoặc là tiếng Việt không dấu —
 * cả hai đều vi phạm quy tắc cứng của app.
 *
 * Đã bắt được thật: `nemotron-3-super-120b-a12b` viết note tiếng Việt sạch
 * nhưng strengths/gaps/recommendation lại ra "React & Next.js expertise",
 * "Strong Fit – definitely apply". Schema khớp, `foreignScript` không thấy gì,
 * và kết quả vẫn không dùng được.
 */
const hasVietnamese = (text) => /[àáâãèéêìíòóôõùúýăđĩũơư]|[Ạ-ỹ]/i.test(text);
const words = (text) => text.trim().split(/\s+/).length;

const notVietnamese = (text) => words(text) >= 3 && !hasVietnamese(text);

/**
 * App đòi mỗi phần tử strengths/gaps và recommendation là **một câu tiếng Việt
 * hoàn chỉnh**, không phải từ khoá rời. Kiểm riêng vì đây là chỗ model tuột
 * chuẩn trước tiên: `tencent/hy3` viết note tiếng Việt rất tốt nhưng strengths
 * lại ra `["React", "Next.js", "TypeScript"]` và recommendation ra "Strong Fit".
 * Bản kiểm cũ đòi >= 3 từ nên những chuỗi 1-2 từ đó lọt sạch.
 */
const notASentence = (text) => words(text) < 5 || !hasVietnamese(text);

const englishFields = (object) => {
  const notes = [
    ['technical.note', object.technical.note],
    ['eligibility.note', object.eligibility.note],
  ].filter(([, t]) => notVietnamese(t));

  const sentences = [
    ...object.strengths.map((s, i) => [`strengths[${i}]`, s]),
    ...object.gaps.map((s, i) => [`gaps[${i}]`, s]),
    ['recommendation', object.recommendation],
  ].filter(([, t]) => notASentence(t));

  return [...notes, ...sentences].map(([name]) => name);
};

const run = async (ref) => {
  const { providerId, modelId } = parseRef(ref);
  const label = `${providerId}/${modelId}`;
  const startedAt = Date.now();

  if (!PROVIDERS[providerId].apiKey()) {
    return { modelId: label, ok: false, ms: 0, reason: 'chưa có API key' };
  }

  try {
    const { object } = await generateObject({
      model: clientFor(providerId)(modelId),
      schema,
      system,
      prompt,
      maxRetries: 0,
      // Cùng mốc `DEFAULT_TIMEOUT_MS` của AiService: model chậm hơn mốc này thì
      // app cũng bỏ, nên đo không có hạn giờ là đo một tác vụ khác.
      abortSignal: AbortSignal.timeout(90_000),
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

    const foreign = foreignScript(allText(object));
    if (foreign) problems.push(`chữ ngoài bảng Latin: ${foreign}`);

    const english = englishFields(object);
    if (english.length) problems.push(`không phải tiếng Việt: ${english.join(', ')}`);

    return { modelId: label, ok: true, ms, scores, object, problems };
  } catch (error) {
    const ms = Date.now() - startedAt;
    const reason = NoObjectGeneratedError.isInstance(error)
      ? 'không khớp schema'
      : String(error.message ?? error).slice(0, 90);
    return { modelId: label, ok: false, ms, reason };
  }
};

console.log(`Benchmark ${MODELS.length} model, prompt thật ${system.length} ký tự\n`);
const results = await Promise.all(MODELS.map(run));

console.log('| Model                                     | KQ  | Giây | Điểm KT/KN/HV/DH | Vấn đề |');
console.log('|-------------------------------------------|-----|------|------------------|--------|');
for (const r of results.sort((a, b) => Number(b.ok) - Number(a.ok) || a.ms - b.ms)) {
  const s = (r.ms / 1000).toFixed(0).padStart(4);
  if (!r.ok) {
    console.log(`| ${r.modelId.padEnd(41)} | LỖI | ${s} | -                | ${r.reason} |`);
  } else {
    const sc = r.scores.join('/').padEnd(16);
    console.log(`| ${r.modelId.padEnd(41)} | OK  | ${s} | ${sc} | ${r.problems.join('; ') || 'không'} |`);
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
