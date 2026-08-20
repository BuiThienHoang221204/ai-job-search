/**
 * Đo sức chứa ĐƯỜNG ĐỌC của một instance: dashboard, danh sách việc, chi tiết
 * tin, danh sách match. Đây là 95% lượt tương tác của người dùng, và là đường
 * duy nhất KHÔNG gọi model - nên nó là con số "chịu được bao nhiêu người" thật.
 *
 * Đơn vị đo là MỘT instance, và đó là đơn vị đúng: sức chứa cụm = số này nhân
 * số bản chạy song song.
 *
 * Bắt buộc chạy máy chủ với THROTTLE_DISABLED=true. Trần chung là 120 request
 * mỗi phút mỗi IP, mà load test bắn từ một máy tức một IP - không tắt thì bạn
 * đo cái rate limiter chứ không đo cái app.
 *
 * Dùng: node scripts/loadtest-read.mjs [số kết nối] [số giây]
 */
import 'dotenv/config';
import autocannon from 'autocannon';

const BASE = process.env.LOADTEST_URL ?? 'http://127.0.0.1:4000/api';
const EMAIL = process.env.LOADTEST_EMAIL ?? 'demo@aijob.local';
const PASSWORD = process.env.LOADTEST_PASSWORD ?? 'Demo@12345';

const connections = Number.parseInt(process.argv[2] ?? '20', 10);
const duration = Number.parseInt(process.argv[3] ?? '10', 10);

/** Đăng nhập một lần rồi tái dùng cookie, để không đo luôn cả bcrypt. */
async function login() {
  const response = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });

  if (!response.ok) {
    throw new Error(
      `Đăng nhập thất bại (${response.status}). Kiểm tra tài khoản "${EMAIL}" - ` +
        `chạy \`pnpm db:seed\` nếu database vừa được dựng lại.`,
    );
  }

  const raw = response.headers.getSetCookie?.() ?? [];
  const cookie = raw.map((line) => line.split(';')[0]).join('; ');
  if (!cookie.includes('aijob_token')) {
    throw new Error('Đăng nhập xong nhưng không thấy cookie aijob_token.');
  }
  return cookie;
}

/** Lấy một id tin có thật, để route chi tiết không đo nhánh 404. */
async function sampleJobId(cookie) {
  const response = await fetch(`${BASE}/jobs?limit=1`, { headers: { cookie } });
  if (!response.ok) {
    throw new Error(
      `GET /jobs trả ${response.status}: ${(await response.text()).slice(0, 200)}`,
    );
  }
  const body = await response.json();
  return body?.items?.[0]?.id ?? null;
}

async function run(name, path, cookie) {
  const result = await autocannon({
    url: `${BASE}${path}`,
    connections,
    duration,
    headers: { cookie },
  });

  const bad = result.non2xx + result.errors + result.timeouts;
  return {
    name,
    rps: Math.round(result.requests.average),
    p50: result.latency.p50,
    p95: result.latency.p97_5,
    p99: result.latency.p99,
    max: result.latency.max,
    bad,
  };
}

const cookie = await login();
const jobId = await sampleJobId(cookie);

/**
 * Tham số phân trang là `limit`/`offset`, KHÔNG phải `page`/`pageSize`. Sai tên
 * thì `ValidationPipe` với `forbidNonWhitelisted` trả 400 - autocannon vẫn báo
 * req/s cao đẹp vì 400 cũng là một phản hồi, chỉ có cột lỗi mới lộ ra.
 */
const targets = [
  ['dashboard', '/dashboard'],
  ['danh sách việc', '/jobs?limit=20'],
  ['danh sách + lọc ngành', '/jobs?limit=20&occupation=IT'],
  ['danh sách match', '/matches?limit=20'],
];

if (jobId) targets.push(['chi tiết tin', `/jobs/${jobId}`]);

console.log(
  `Đo ${BASE} - ${connections} kết nối, ${duration}s mỗi route\n` +
    (process.env.THROTTLE_DISABLED === 'true'
      ? ''
      : 'CẢNH BÁO: máy chủ có bật rate limit thì con số dưới đây là của rate limiter.\n'),
);

const rows = [];
for (const [name, path] of targets) {
  rows.push(await run(name, path, cookie));
}

const pad = (value, width) => String(value).padEnd(width);
console.log(
  pad('route', 24) + pad('req/s', 9) + pad('p50', 8) + pad('p95', 8) +
    pad('p99', 9) + pad('max', 9) + 'lỗi',
);
console.log('-'.repeat(74));
for (const row of rows) {
  console.log(
    pad(row.name, 24) + pad(row.rps, 9) + pad(`${row.p50}ms`, 8) +
      pad(`${row.p95}ms`, 8) + pad(`${row.p99}ms`, 9) +
      pad(`${row.max}ms`, 9) + (row.bad || '0'),
  );
}
