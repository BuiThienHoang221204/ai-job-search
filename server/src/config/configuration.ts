import { resolve } from 'node:path';

/// Các đường dẫn trong .env đều tương đối so với thư mục server/.
/// Đổi ra tuyệt đối ngay từ đây, vì SkillRegistry và LocalStorage không được
/// phép phụ thuộc vào cwd lúc chạy (nest start và nest build chạy khác cwd).
const fromServerRoot = (relative: string) => resolve(process.cwd(), relative);

const configuration = () => ({
  port: parseInt(process.env.PORT ?? '4000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',

  auth: {
    jwtSecret: process.env.JWT_SECRET ?? '',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  },

  ai: {
    provider: process.env.MODEL_PROVIDER ?? 'opencode',
    modelId: process.env.MODEL_ID ?? 'deepseek-v4-flash-free',
    apiKey: process.env.AI_API_KEY ?? 'public',
    catalogUrl:
      process.env.OPENCODE_MODELS_URL ?? 'https://models.opencode.ai/api.json',

    // Điểm khởi đầu cho việc dò chế độ ép định dạng đầu ra, KHÔNG phải quyết
    // định cuối cùng - AiService tự đổi nếu gateway từ chối và nhớ lại.
    //
    // Mặc định false vì đó là chế độ gateway đang chấp nhận (đã đo:
    // response_format kèm json_schema bị trả "unavailable now", còn
    // json_object thì chạy). Đặt AI_STRUCTURED_OUTPUTS=true khi đổi sang nhà
    // cung cấp có hỗ trợ JSON schema thật - đỡ được một lần hỏng lúc khởi động.
    structuredOutputs: process.env.AI_STRUCTURED_OUTPUTS === 'true',
  },

  skills: {
    // Trỏ thẳng ra .claude/skills ở gốc repo. Không được dò tìm ".claude" gần
    // nhất: server/.claude/skills/ là skill của Prisma CLI, không liên quan.
    dir: fromServerRoot(process.env.SKILLS_DIR ?? '../.claude/skills'),
  },

  scraper: {
    // Một lần gọi CLI gồm fetch + parse; 60 giây đủ rộng cho cả trường hợp
    // portal chậm và CLI phải lui dần khi gặp 429.
    timeoutMs: parseInt(process.env.SCRAPER_TIMEOUT_MS ?? '60000', 10),

    // Thư mục chứa các portal CLI. Quét động lúc khởi động, không khai cứng
    // trong code - thêm portal = thêm thư mục.
    portalsDir: fromServerRoot(process.env.PORTALS_DIR ?? '../.agents/skills'),

    // Nghỉ giữa hai lần gọi portal. Không portal nào trong số này khai
    // Crawl-delay trong robots.txt, nên phải tự đặt nhịp. Bắn liên tiếp là
    // cách nhanh nhất để bị chặn IP máy chủ - mà chặn thì mất cả sản phẩm,
    // không chỉ mất một lần quét.
    portalDelayMs: parseInt(process.env.SCRAPER_PORTAL_DELAY_MS ?? '3000', 10),

    // Địa điểm mặc định khi hồ sơ người dùng chưa khai. LinkedIn BẮT BUỘC có
    // --location, khác với ITviec.
    defaultLocation: process.env.SCRAPER_DEFAULT_LOCATION ?? 'Vietnam',

    // Số tin tối đa lấy về mỗi portal trong một lần quét. Chặn trên để một
    // portal đổi phân trang không kéo theo hàng nghìn request.
    maxJobsPerPortal: parseInt(
      process.env.SCRAPER_MAX_JOBS_PER_PORTAL ?? '25',
      10,
    ),
  },

  cron: {
    // Quét tin hàng đêm. Tắt bằng SCRAPE_CRON_ENABLED=false khi chạy máy cục
    // bộ, để không gọi vào portal mỗi lần mở máy.
    scrapeEnabled: process.env.SCRAPE_CRON_ENABLED !== 'false',
    // Định dạng cron 5 trường. Mặc định 23:00 hằng ngày.
    scrapeSchedule: process.env.SCRAPE_CRON_SCHEDULE ?? '0 23 * * *',
    // Múi giờ PHẢI khai tường minh. Máy chủ thường chạy UTC, và '0 23 * * *'
    // theo UTC là 6 giờ sáng hôm sau ở Việt Nam.
    timezone: process.env.CRON_TIMEZONE ?? 'Asia/Ho_Chi_Minh',
  },

  storage: {
    driver: process.env.STORAGE_DRIVER ?? 'local',
    localRoot: fromServerRoot(
      process.env.STORAGE_LOCAL_ROOT ?? '../workspaces',
    ),
  },
});

export type AppConfig = ReturnType<typeof configuration>;
export default configuration;
