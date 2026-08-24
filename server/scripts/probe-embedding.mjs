/**
 * Đo xem embedding cục bộ có tách được "cùng nghĩa" khỏi "gần nghĩa" không.
 *
 * Chạy TRƯỚC khi xây danh bạ kỹ năng: nếu `Y tá`/`Điều dưỡng` không cao hơn hẳn
 * `Java`/`JavaScript` thì embedding không giải được bài toán và phải đổi hướng.
 *
 * Cờ:
 *   --model X   thử một model khác (mặc định multilingual-e5-base, 768 chiều)
 *   --dtype X   fp32 (mặc định) hoặc q8 - bản nén nhỏ hơn 4 lần
 */
import { env, pipeline } from '@huggingface/transformers';

const MODEL =
  process.argv[process.argv.indexOf('--model') + 1]?.startsWith('--') ||
  !process.argv.includes('--model')
    ? 'Xenova/multilingual-e5-base'
    : process.argv[process.argv.indexOf('--model') + 1];

const argOf = (flag, fallback) => {
  const at = process.argv.indexOf(flag);
  return at >= 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
};
const DTYPE = argOf('--dtype', 'fp32');

env.allowLocalModels = false;

/** Cặp PHẢI gần nhau: cùng một nghề, khác cách gọi. */
const SAME = [
  ['Điều dưỡng', 'Y tá'],
  ['English Teaching', 'Dạy tiếng Anh'],
  ['K8s', 'Kubernetes'],
  ['CSKH', 'Chăm sóc khách hàng'],
  ['XNK', 'Xuất nhập khẩu'],
  ['BCTC', 'Báo cáo tài chính'],
  ['Kế toán tổng hợp', 'General Accountant'],
  ['Ke toan', 'Kế toán'],
  ['Lái xe nâng', 'Vận hành xe nâng'],
  ['Điều dưỡng', 'Nurse'],
];

/** Cặp PHẢI xa nhau: gần nghĩa nhưng KHÔNG thay thế được cho nhau. */
const DIFFERENT = [
  ['Java', 'JavaScript'],
  ['Kế toán', 'Kiểm toán'],
  ['React', 'Vue'],
  ['Điều dưỡng', 'Bác sĩ'],
  ['Tiếng Nhật N2', 'Tiếng Hàn TOPIK'],
  ['IT', 'Digital Marketing'],
  ['Excel', 'Technical excellence'],
];

const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);

async function main() {
  const startedAt = Date.now();
  console.log(`Nạp model ${MODEL} (dtype=${DTYPE})...`);
  const extract = await pipeline('feature-extraction', MODEL, { dtype: DTYPE });
  console.log(`Nạp xong sau ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
  console.log(
    `RAM tiến trình: ${(process.memoryUsage().rss / 1024 / 1024).toFixed(0)}MB\n`,
  );

  const terms = [...new Set([...SAME, ...DIFFERENT].flat())];
  const embedAt = Date.now();
  const output = await extract(
    terms.map((term) => `query: ${term}`),
    { pooling: 'mean', normalize: true },
  );
  const vectors = new Map(
    terms.map((term, i) => [term, output.tolist()[i]]),
  );
  console.log(
    `Embed ${terms.length} chuỗi mất ${Date.now() - embedAt}ms, ${output.dims[1]} chiều\n`,
  );

  const show = (title, pairs) => {
    console.log(title);
    const scores = [];
    for (const [a, b] of pairs) {
      const score = dot(vectors.get(a), vectors.get(b));
      scores.push(score);
      console.log(`  ${score.toFixed(3)}  ${a}  <->  ${b}`);
    }
    return scores;
  };

  const same = show('CÙNG NGHĨA (cosine phải CAO)', SAME);
  console.log();
  const diff = show('KHÁC NGHĨA (cosine phải THẤP)', DIFFERENT);

  const min = Math.min(...same);
  const max = Math.max(...diff);
  console.log(`\nThấp nhất của nhóm cùng nghĩa : ${min.toFixed(3)}`);
  console.log(`Cao nhất  của nhóm khác nghĩa : ${max.toFixed(3)}`);
  console.log(
    min > max
      ? `=> TÁCH ĐƯỢC. Mọi ngưỡng trong khoảng (${max.toFixed(3)}, ${min.toFixed(3)}) đều đúng cả 17 cặp.`
      : `=> KHÔNG tách được bằng một ngưỡng duy nhất; chồng lấn ${(max - min).toFixed(3)}.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
