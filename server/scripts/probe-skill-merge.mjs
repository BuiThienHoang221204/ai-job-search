/**
 * Đo xem model có phân loại kỹ năng đúng không, trên một đề bài BIẾT TRƯỚC đáp án.
 *
 * Chạy sau khi lô đầu tiên gộp `English` với `manual testing`: cần biết đó là
 * model phán sai, hay là số thứ tự trả về lệch khỏi đề bài.
 *
 * Cờ:
 *   --model X   ép một model cụ thể, ví dụ deepseek-v4-flash-free
 */
process.env.APP_ROLE = 'api';

import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/app.module.js';
import { AiService } from '../dist/modules/ai/services/ai.service.js';
import { skillMergeSchema } from '../dist/modules/matching/schemas/skill-merge.schema.js';

const at = process.argv.indexOf('--model');
const MODEL_ID = at >= 0 ? process.argv[at + 1] : undefined;

/** `dung` = số thứ tự ứng viên ĐÚNG, 0 nghĩa là không cái nào. */
const CASES = [
  { term: 'Y tá', near: ['Điều dưỡng', 'Bác sĩ', 'Hộ lý', 'Dược sĩ', 'Kỹ thuật viên'], dung: 1 },
  { term: 'JavaScript', near: ['Java', 'TypeScript', 'Node.js', 'Angular', 'RxJS'], dung: 0 },
  { term: 'K8s', near: ['Kubernetes', 'Docker', 'AWS', 'Terraform', 'Helm'], dung: 1 },
  { term: 'manual testing', near: ['English', 'Automation testing', 'QA', 'Selenium', 'Jira'], dung: 0 },
  { term: 'CSKH', near: ['Bán hàng', 'Chăm sóc khách hàng', 'Telesales', 'Marketing', 'Nhân sự'], dung: 2 },
  { term: 'SASS', near: ['CSS', 'HTML', 'Bootstrap', 'Tailwind CSS', 'LESS'], dung: 0 },
  { term: 'ReactJS', near: ['Vue', 'Angular', 'React', 'Svelte', 'Next.js'], dung: 3 },
  { term: 'Kiểm toán', near: ['Kế toán', 'Thuế', 'Tài chính', 'Ngân hàng', 'Kiểm soát nội bộ'], dung: 0 },
];

const SYSTEM = [
  'Bạn phân loại KỸ NĂNG NGHỀ NGHIỆP. Với mỗi chuỗi, chọn ứng viên chỉ CÙNG MỘT kỹ năng với nó.',
  '',
  'Quy tắc bắt buộc:',
  '- CÙNG MỘT kỹ năng nghĩa là người tuyển dụng viết cách này hay cách kia đều nhận cùng một ứng viên: viết tắt, dịch sang ngôn ngữ khác, hoặc cách gọi khác của đúng nghề đó.',
  '- GẦN NGHĨA thì KHÔNG phải cùng một kỹ năng. Đây là chỗ dễ sai nhất:',
  '  · Java và JavaScript là hai ngôn ngữ khác nhau -> 0',
  '  · Kế toán và Kiểm toán là hai nghề khác nhau -> 0',
  '  · Điều dưỡng và Bác sĩ là hai nghề khác nhau -> 0',
  '  · React và Vue là hai thư viện khác nhau -> 0',
  '- Ngược lại, những cặp sau ĐÚNG là một: Y tá và Điều dưỡng, K8s và Kubernetes, CSKH và Chăm sóc khách hàng.',
  '- Không chắc thì trả 0.',
  '- Mỗi chuỗi trong đề bài phải có đúng một dòng trả lời.',
].join('\n');

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const ai = app.get(AiService);

  const prompt = CASES.map((row, i) =>
    [`[${i + 1}] ${row.term}`, ...row.near.map((n, at) => `    ${at + 1}. ${n}`)].join('\n'),
  ).join('\n\n');

  const { object, modelId } = await ai.generateObject({
    schema: skillMergeSchema,
    context: { purpose: 'skill.canonicalize' },
    system: SYSTEM,
    prompt: `Phân loại từng chuỗi dưới đây:\n\n${prompt}`,
    ...(MODEL_ID ? { modelId: MODEL_ID } : {}),
  });

  console.log(`\nModel: ${modelId}`);
  console.log(`Trả về ${object.decisions.length}/${CASES.length} dòng\n`);

  const picks = new Map(object.decisions.map((d) => [d.term, d.match]));
  let dung = 0;
  for (const [i, row] of CASES.entries()) {
    const got = picks.get(i + 1);
    const ok = got === row.dung;
    if (ok) dung += 1;
    const chon = got === 0 ? '(không cái nào)' : (row.near[got - 1] ?? `?? số ${got}`);
    const canDung = row.dung === 0 ? '(không cái nào)' : row.near[row.dung - 1];
    console.log(
      `${ok ? 'ĐÚNG' : 'SAI '}  ${row.term.padEnd(16)} -> ${String(chon).padEnd(24)} (đáp án: ${canDung})`,
    );
  }
  console.log(`\n${dung}/${CASES.length} đúng`);
  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
