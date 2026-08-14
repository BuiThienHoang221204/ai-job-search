import { spawnSync } from 'node:child_process';

/// Chạy bộ test tích hợp với cờ Node mà jest đòi hỏi.
///
/// Prisma 7 nạp WASM query compiler bằng `await import()` (xem
/// test/tsconfig.e2e.json về việc giữ nguyên `import()` thay vì hạ cấp thành
/// `require()`). Bên trong môi trường test của jest, `import()` động chỉ hoạt
/// động khi Node được bật `--experimental-vm-modules`.
///
/// Cờ đó là cờ của Node, không phải của jest, nên phải đi qua NODE_OPTIONS. Đặt
/// nó bằng env của tiến trình con thay vì viết `NODE_OPTIONS=... jest` trong
/// package.json: cú pháp gán biến ngay trước lệnh không chạy trên cmd.exe của
/// Windows, mà đây là môi trường phát triển chính của dự án.
const flag = '--experimental-vm-modules';
const nodeOptions = [process.env.NODE_OPTIONS, flag]
  .filter(Boolean)
  .join(' ');

const result = spawnSync(
  'npx',
  ['jest', '--config', './test/jest-e2e.json', ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, NODE_OPTIONS: nodeOptions },
  },
);

process.exit(result.status ?? 1);
