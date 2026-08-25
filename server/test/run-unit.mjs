import { spawnSync } from 'node:child_process';

/**
 * Chạy bộ test đơn vị với cờ Node mà jest đòi hỏi.
 *
 * Song sinh với `run-e2e.mjs`, và vì cùng một nguyên nhân gốc: **jest chỉ cho
 * `import()` động hoạt động khi Node bật `--experimental-vm-modules`**. Trước đây
 * chỉ e2e cần (Prisma 7 nạp WASM query compiler bằng `import()`); nay bộ đơn vị
 * cũng cần, vì `pdf-parse` nạp worker pdfjs theo cùng cách.
 *
 * ĐÃ THỬ VÀ KHÔNG TRÁNH ĐƯỢC, để người sau không mất công thử lại:
 *
 * - `PDFParse.setWorker()` trả về `./pdf.worker.mjs` — worker của pdfjs là ESM,
 *   nên nó luôn được nạp bằng `import()` động.
 * - `unpdf` (thư viện thay thế, quảng cáo là chạy được trong môi trường
 *   serverless không worker) thất bại y hệt: "Serverless PDF.js bundle could not
 *   be resolved: A dynamic import callback was invoked without
 *   --experimental-vm-modules".
 *
 * Nói cách khác đây không phải hệ quả của việc chọn thư viện: **mọi** đường đọc
 * PDF trong Node đều đi qua pdfjs, và pdfjs nạp phần lõi bằng `import()`.
 *
 * Cờ đi qua NODE_OPTIONS chứ không viết `NODE_OPTIONS=... jest` trong
 * package.json, vì cú pháp gán biến ngay trước lệnh không chạy trên cmd.exe của
 * Windows — môi trường phát triển chính của dự án.
 */
const flag = '--experimental-vm-modules';
const nodeOptions = [process.env.NODE_OPTIONS, flag].filter(Boolean).join(' ');

const result = spawnSync('npx', ['jest', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, NODE_OPTIONS: nodeOptions },
});

process.exit(result.status ?? 1);
