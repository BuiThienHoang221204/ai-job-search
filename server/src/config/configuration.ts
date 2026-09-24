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
  // Số proxy tin được phía trước (Caddy = 1); 0 = không tin X-Forwarded-For, tránh client tự khai IP để né rate limit.
  trustProxyHops: parseInt(process.env.TRUST_PROXY ?? '0', 10) || 0,

  auth: {
    jwtSecret: process.env.JWT_SECRET ?? '',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  },

  ai: {
    /** Lõi mặc định. Các lõi hệ thống biết nằm ở `modules/ai/providers/`. */
    provider: process.env.MODEL_PROVIDER ?? 'omniroute',
    modelId: process.env.MODEL_ID ?? 'kc/openrouter/free',

    /**
     * Trần thời gian cho CẢ chuỗi dự phòng, không phải cho từng mắt xích. Mỗi
     * mắt xích nhận một `AbortSignal.timeout` mới, nên n mắt xích chậm cộng lại
     * thành n lần hạn một lời gọi - phải nhỏ hơn `server.setTimeout` 5 phút.
     */
    chainBudgetMs: parseInt(process.env.AI_CHAIN_BUDGET_MS ?? '240000', 10),

    /**
     * Các mắt xích thử tiếp khi mắt xích đang dùng không chạy được. Viết
     * `lõi/model` để nhảy sang lõi khác, hoặc chỉ `model` cho lõi mặc định.
     *
     * Mắt xích CUỐI cố ý không đi qua omniroute: gateway sập thì cả họ `auto/*`
     * sập theo, riêng nó vẫn sống vì gọi thẳng OpenRouter bằng key riêng.
     */
    fallbackModelIds: (
      process.env.MODEL_FALLBACK_IDS ??
      'auto/fast,auto/best-chat,openrouter/nex-agi/nex-n2.5-pro:free'
    )
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),

    /**
     * Key theo từng lõi. Tên biến môi trường tương ứng được khai trong
     * `providers/<lõi>.ts` để câu báo lỗi chỉ đúng chỗ cần sửa.
     */
    apiKeys: {
      opencode: process.env.AI_API_KEY ?? 'public',
      openrouter: process.env.OPENROUTER_API_KEY ?? '',
      omniroute: process.env.OMNIROUTE_API_KEY ?? 'public',
      /**
       * Kilo nhận request mà KHÔNG cần key — đã đo, cả không header lẫn
       * `Bearer public` đều trả 200. Để mặc định `'public'` thay vì chuỗi rỗng
       * vì đó là giá trị đã thử thật; chuỗi rỗng thì chưa biết SDK gửi header
       * kiểu gì.
       */
      kilo: process.env.KILO_API_KEY ?? 'public',
    } as Record<string, string>,

    /**
     * `User-Agent` gửi kèm request, theo từng lõi. Bỏ trống = dùng mặc định của thư viện HTTP.
     */
    userAgents: {
      opencode: process.env.OPENCODE_USER_AGENT ?? 'opencode',
    } as Record<string, string>,

    baseURLs: {
      omniroute: process.env.OMNIROUTE_BASE_URL ?? 'http://localhost:20128/v1',
      /** Bỏ trống có chủ ý: container `opencode` nằm sau profile riêng, chưa bật thì lõi này phải tự vắng mặt. */
      opencode: process.env.OPENCODE_SERVICE_URL ?? '',
    } as Record<string, string>,

    catalogUrl:
      process.env.OPENCODE_MODELS_URL ?? 'https://models.opencode.ai/api.json',

    structuredOutputs: (process.env.AI_STRUCTURED_OUTPUTS ?? 'true') === 'true',
  },

  /**
   * Pha 4 · lọc sơ bộ bằng ngữ nghĩa. Nhà cung cấp RIÊNG cho embedding, vì đã
   * đo: OpenCode không có model embedding nào, OpenRouter cũng vậy (0/413).
   */
  semantic: {
    apiKey: process.env.GEMINI_API_KEY ?? '',

    /**
     * Số tin đưa cho model chấm điểm với mỗi người dùng, sau khi lọc bằng
     * vector. Hiện fan-out chấm MỌI tin × MỌI người; đây là con số thay thế
     * phép nhân đó.
     */
    topK: parseInt(process.env.SEMANTIC_TOP_K ?? '10', 10),
  },

  skills: {
    dir: fromServerRoot(process.env.SKILLS_DIR ?? '../.claude/skills'),
  },

  /**
   * Trần cho mọi lượt ra mạng: tool `fetch_url`/`web_search` của agent và luồng
   * tìm hiểu công ty đều đọc ở đây.
   *
   * TÊN BIẾN MÔI TRƯỜNG GIỮ NGUYÊN `AGENT_FETCH_*` và `SERPER_*`. Đổi tên biến
   * là đúng cái đã gây ra sự cố ngày 2026-08-24: `configuration.ts` đọc
   * `WEB_SEARCH_API_KEY` trong khi `.env` khai `SERPER_API_KEY`, nên khoá luôn
   * rỗng và tool `web_search` chưa từng chạy mà không có lỗi nào.
   */
  web: {
    fetchMaxBytes: parseInt(process.env.AGENT_FETCH_MAX_BYTES ?? '2000000', 10),
    fetchTimeoutMs: parseInt(process.env.AGENT_FETCH_TIMEOUT_MS ?? '20000', 10),
    /**
     * Serper. Không có key thì tool `web_search` KHÔNG được đăng ký - agent
     * thấy nó vắng mặt và tự xoay xở, thay vì gọi rồi nhận lỗi ở mọi bước.
     */
    search: {
      apiKey: process.env.SERPER_API_KEY ?? '',
      url: process.env.SERPER_URL ?? 'https://google.serper.dev/search',
      maxResults: parseInt(process.env.SERPER_MAX_RESULTS ?? '5', 10),
    },
  },

  scraper: {
    timeoutMs: parseInt(process.env.SCRAPER_TIMEOUT_MS ?? '60000', 10),

    portalsDir: fromServerRoot(process.env.PORTALS_DIR ?? '../.agents/skills'),

    portalDelayMs: parseInt(process.env.SCRAPER_PORTAL_DELAY_MS ?? '3000', 10),

    defaultLocation: process.env.SCRAPER_DEFAULT_LOCATION ?? 'Vietnam',

    /** Trần số tin lấy về cho MỘT portal trong một lần quét. */
    maxJobsPerPortal: parseInt(
      process.env.SCRAPER_MAX_JOBS_PER_PORTAL ?? '50',
      10,
    ),

    /** Chỉ lấy tin đăng trong bao nhiêu ngày gần nhất. */
    maxAgeDays: parseInt(process.env.SCRAPER_MAX_AGE_DAYS ?? '7', 10),

    /**
     * Trần số trang duyệt cho MỘT truy vấn. LinkedIn trả 10 tin một trang, nên
     * không phân trang thì một truy vấn không bao giờ đạt trần `maxJobsPerPortal`.
     */
    maxPages: parseInt(process.env.SCRAPER_MAX_PAGES ?? '5', 10),

    /** Tin không đọc được ngày đăng: mặc định GIỮ, bật cờ này thì loại. */
    requirePostedAt: process.env.SCRAPER_REQUIRE_POSTED_AT === 'true',

    /**
     * Trần số từ khoá cho một lần quét của HỆ THỐNG. Mỗi từ khoá là ít nhất
     * một request, nên đây là tải đặt lên portal.
     *
     * Từ khoá gom theo NGHỀ (danh mục 77 mục), nên con số này là trần tải chứ
     * không còn phải tăng theo số người dùng. Nó quyết định chu kỳ phủ hết
     * danh mục: 20 nghề mỗi đêm thì mọi nghề có người dùng được quét sau
     * khoảng bốn đêm, theo thứ tự cũ-trước của `OccupationCrawl`.
     */
    systemQueryLimit: parseInt(
      process.env.SCRAPER_SYSTEM_QUERY_LIMIT ?? '20',
      10,
    ),

    /**
     * Có tự chấm điểm mọi tin mới với mọi hồ sơ sau mỗi lượt quét không.
     *
     * MẶC ĐỊNH TẮT. Đây là phép nhân `số người × số tin`, thứ chặn hệ thống ở
     * khoảng 30 người dùng: hàng đợi chấm điểm chạy tuần tự, p50 33 giây, nên
     * một đêm không đủ dài để rút hết. Nay điểm được chấm khi người dùng bấm,
     * còn màn danh sách hiển thị mức khớp tính bằng code thuần.
     *
     * Bật lại khi đã có nhà cung cấp model trả tiền và hàng đợi chạy song song.
     */
    autoScore: process.env.SCRAPER_AUTO_SCORE === 'true',
  },

  matching: {
    /**
     * Tin phải khớp bao nhiêu phần trăm yêu cầu mới vào "Việc làm phù hợp".
     *
     * Tính trên yêu cầu NĂNG LỰC, bắt buộc tính 1 và ưu tiên tính 0,5. Đo trên
     * 322 tin ngày 2026-08-24: mốc 50 cho 0-13 tin mỗi hồ sơ, mốc 30 cho 1-70.
     */
    minPercent: parseInt(process.env.MATCH_MIN_PERCENT ?? '50', 10),

    /** Bỏ trống = dùng model mặc định. Đo 2026-09-24 bằng `probe-skill-merge`: model mặc định đúng 8/8 ba lượt liền, nên không cần ghim riêng nữa. */
    dictionaryModelId: process.env.SKILL_DICTIONARY_MODEL_ID || undefined,

    aiAuto: process.env.MATCH_AI_AUTO === 'true',
    aiTopN: parseInt(process.env.MATCH_AI_TOP_N ?? '3', 10),
    aiMaxPerRun: parseInt(process.env.MATCH_AI_MAX_PER_RUN ?? '300', 10),
    aiCooldownHours: parseInt(process.env.MATCH_AI_COOLDOWN_HOURS ?? '6', 10),
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

  pdf: {
    /**
     * URL của dịch vụ in HTML ra PDF. Có giá trị thì dùng `HttpPdfRenderer`
     * (production), bỏ trống thì dùng `SandboxPdfRenderer` gọi `docker run` (máy
     * phát triển). Cùng cách chọn với `latex.serviceUrl` ngay trên.
     */
    serviceUrl: process.env.PDF_SERVICE_URL?.replace(/\/$/, '') ?? null,
  },

  storage: {
    r2Endpoint: process.env.R2_ENDPOINT ?? '',
    r2Bucket: process.env.R2_BUCKET ?? '',
    r2AccessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
    r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
  },
});

export type AppConfig = ReturnType<typeof configuration>;
export default configuration;
