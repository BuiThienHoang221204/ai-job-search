/**
 * Chạy MỘT lượt Assisted Apply thật, qua đúng `DockerSandbox` mà production dùng.
 *
 * Vì sao là script chứ không phải test: nó cần Docker, ảnh 3,54GB, và Internet — ba
 * thứ không được có trong bộ test. Test đơn vị đã phủ phần quyết định
 * (`field-plan.spec.ts`); script này trả lời câu khác: **cả đường có chạy thật không**.
 *
 * Dùng:
 *   node scripts/probe-assisted-apply.mjs <url>
 *
 * Mặc định nhắm một tin Greenhouse — form ứng tuyển công khai, không đòi đăng nhập.
 * Nó KHÔNG bấm nút nộp; xem docblock của `BrowserApplyService`.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const url =
  process.argv[2] ??
  'https://job-boards.greenhouse.io/greenhouse/jobs/8017323?gh_jid=8017323';

// Nạp bản đã build để dùng ĐÚNG code của production, không phải một bản chép lại.
const { APPLY_SCRIPT } = await import('../dist/modules/apply/apply-script.js');
const {
  buildFillRules,
  LOGIN_MARKERS,
  CV_FILENAME,
  COVER_FILENAME,
  classifyOutcome,
  outcomeMessage,
} = await import('../dist/modules/apply/field-plan.js');

const identity = {
  name: 'Phạm Quản Trị',
  email: 'admin@aijob.local',
  phone: '0901234567',
  location: 'Hồ Chí Minh',
};

const work = mkdtempSync(join(tmpdir(), 'aijob-apply-probe-'));
writeFileSync(join(work, 'apply.mjs'), APPLY_SCRIPT);
writeFileSync(
  join(work, 'input.json'),
  JSON.stringify({
    url,
    rules: buildFillRules(identity, { cv: true, coverLetter: true }),
    loginMarkers: LOGIN_MARKERS,
    cookieButtons: ['chấp nhận tất cả', 'đồng ý', 'accept all', 'accept cookies'],
    navigationTimeoutMs: 45_000,
  }),
);
// PDF giả nhưng hợp lệ ở mức header: đủ để `setInputFiles` chấp nhận.
writeFileSync(join(work, CV_FILENAME), Buffer.from('%PDF-1.7\n% gia lap CV\n'));
writeFileSync(
  join(work, COVER_FILENAME),
  Buffer.from('%PDF-1.7\n% gia lap thu xin viec\n'),
);

const started = Date.now();
const run = spawnSync(
  'docker',
  [
    'run', '--rm', '--name', 'aijob-apply-probe',
    '--network', 'bridge',
    '--memory', '2048m', '--cpus', '2',
    '--pull', 'never',
    '-v', `${work}:/work`, '-w', '/work',
    'aijob-browser:1.62.1',
    'node', 'apply.mjs',
  ],
  { encoding: 'utf8', timeout: 120_000, env: { ...process.env, MSYS_NO_PATHCONV: '1' } },
);

console.log(`docker exit=${run.status} sau ${Date.now() - started}ms`);
if (run.stderr?.trim()) console.log('stderr:', run.stderr.slice(0, 600));

const reportPath = join(work, 'report.json');
if (!existsSync(reportPath)) {
  console.log('KHONG co report.json — script chet truoc khi ghi duoc gi');
  process.exit(1);
}

const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const outcome = classifyOutcome(report);

console.log('\n=== KET QUA ===');
console.log('outcome  :', outcome);
console.log('status   :', report.status, '| reachable:', report.reachable);
console.log('o nhap   :', report.visibleInputs, '| co o file:', report.hasFileInput);
console.log('dau hieu dang nhap:', report.loginHints);
console.log('da dien  :');
for (const f of report.filled) console.log('   -', f.label, '=>', f.value);
console.log('chua khop:', report.unmatched.slice(0, 12));
if (report.error) console.log('loi script:', report.error);
console.log('\ncau cho nguoi dung:\n ', outcomeMessage(outcome, report));

const shot = join(work, 'screenshot.png');
if (existsSync(shot)) {
  const dest = join(process.cwd(), 'tmp-apply-screenshot.png');
  writeFileSync(dest, readFileSync(shot));
  console.log('\nanh chup:', dest, `(${readFileSync(shot).length} byte)`);
} else {
  console.log('\nKHONG co anh chup');
}
