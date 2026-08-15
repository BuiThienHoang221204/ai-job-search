import { resolve } from 'node:path';

/**
 * Các đường dẫn trong .env đều tương đối so với thư mục server/.
 * Đổi ra tuyệt đối ngay từ đây, vì SkillRegistry và LocalStorage không được
 * phép phụ thuộc vào cwd lúc chạy (nest start và nest build chạy khác cwd).
 */
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

    /** Các model thử tiếp khi model chính HẾT HẠN MỨC. */
    fallbackModelIds: (
      process.env.MODEL_FALLBACK_IDS ??
      'deepseek-v4-flash-free,mimo-v2.5-free,nemotron-3.5-lightning-free,hy3-free'
    )
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),

    apiKey: process.env.AI_API_KEY ?? 'public',
    catalogUrl:
      process.env.OPENCODE_MODELS_URL ?? 'https://models.opencode.ai/api.json',

    structuredOutputs: process.env.AI_STRUCTURED_OUTPUTS === 'true',
  },

  skills: {
    dir: fromServerRoot(process.env.SKILLS_DIR ?? '../.claude/skills'),
  },

  scraper: {
    timeoutMs: parseInt(process.env.SCRAPER_TIMEOUT_MS ?? '60000', 10),

    portalsDir: fromServerRoot(process.env.PORTALS_DIR ?? '../.agents/skills'),

    portalDelayMs: parseInt(process.env.SCRAPER_PORTAL_DELAY_MS ?? '3000', 10),

    atsBoards: process.env.ATS_BOARDS ?? '',

    defaultLocation: process.env.SCRAPER_DEFAULT_LOCATION ?? 'Vietnam',

    maxJobsPerPortal: parseInt(
      process.env.SCRAPER_MAX_JOBS_PER_PORTAL ?? '25',
      10,
    ),
  },

  cron: {
    scrapeEnabled: process.env.SCRAPE_CRON_ENABLED !== 'false',
    scrapeSchedule: process.env.SCRAPE_CRON_SCHEDULE ?? '0 23 * * *',
    timezone: process.env.CRON_TIMEZONE ?? 'Asia/Ho_Chi_Minh',

    reconcileEnabled: process.env.RECONCILE_CRON_ENABLED !== 'false',
    reconcileSchedule: process.env.RECONCILE_CRON_SCHEDULE ?? '*/10 * * * *',
  },

  throttle: {
    /** Trần chung cho mọi route, tính theo IP trong một phút. */
    ttlMs: parseInt(process.env.THROTTLE_TTL_MS ?? '60000', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '120', 10),

    /** Tắt hoàn toàn rate limiting. CHỈ dùng cho test tích hợp. */
    disabled: process.env.THROTTLE_DISABLED === 'true',
  },

  latex: {
    /**
     * URL của dịch vụ compile LaTeX. Có giá trị thì dùng `HttpLatexCompiler`
     * (production), bỏ trống thì dùng `SandboxLatexCompiler` gọi `docker run` (máy
     * phát triển).
     */
    serviceUrl: process.env.LATEX_SERVICE_URL?.replace(/\/$/, '') ?? null,
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
