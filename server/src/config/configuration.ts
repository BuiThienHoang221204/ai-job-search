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

    /**
     * Các model thử tiếp khi model chính HẾT HẠN MỨC.
     *
     * Cần thiết vì hạn mức của gateway free tính **theo từng model**, không theo API
     * key — đã đo: cùng một thời điểm, `deepseek-v4-flash-free` và `mimo-v2.5-free`
     * trả 429 `FreeUsageLimitError` trong khi `hy3-free` và
     * `nemotron-3.5-lightning-free` vẫn chạy.
     *
     * Thứ tự mặc định theo chất lượng ĐÃ ĐO, không theo cảm giác:
     *
     * | Model | Structured output | Ghi chú |
     * |---|---|---|
     * | `deepseek-v4-flash-free` | được | đo 215 lượt: 95,3%, p50 33s |
     * | `mimo-v2.5-free` | chưa đo | model free DUY NHẤT nhận ảnh -> đường vision |
     * | `nemotron-3.5-lightning-free` | được | model reasoning, ~740 token suy luận |
     * | `hy3-free` | được | model reasoning, ~1380 token suy luận -> chậm nhất |
     *
     * KHÔNG có `laguna-s-2.1-free` (content rỗng dù cho 1500 token) và
     * `ling-3.0-tiny-free` (server_error).
     *
     * Hai cái sau là model reasoning: chúng tiêu 700–1400 token vào `reasoning_content`
     * TRƯỚC khi sinh content. Vì vậy `AiService` không được đặt `maxOutputTokens` thấp
     * — bóp token thì content ra rỗng và trông y như model không làm được việc. Chính
     * tôi đã kết luận sai như vậy một lần vì thử với `max_tokens: 8`.
     */
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

    /*
     * Các job board ATS công khai cần đọc, dạng `greenhouse:acme,lever:beta`.
     *
     * Vì sao có nguồn này, và lý do KHÔNG phải là "thêm tin": form ứng tuyển của
     * Greenhouse/Lever/Ashby là công khai, nên Assisted Apply chạy thật được. Bốn
     * portal Việt đặt form sau tường đăng nhập nên chúng chỉ trả `LOGIN_WALL`.
     *
     * Rỗng theo mặc định: danh sách công ty là quyết định nghiệp vụ, không phải mặc
     * định kỹ thuật. Cắm sẵn vài công ty vào code sẽ thành "vì sao hệ thống tự lấy
     * tin của công ty này".
     */
    atsBoards: process.env.ATS_BOARDS ?? '',

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

    // Nhặt lại việc nền đã rơi (xem ReconcileService). Bật theo mặc định: đây là
    // lưới hứng, tắt nó đi thì một message bị mất sẽ để người dùng nhìn "đang
    // sinh..." vĩnh viễn mà không ai biết.
    reconcileEnabled: process.env.RECONCILE_CRON_ENABLED !== 'false',
    // 10 phút một lần. Dày hơn thì tốn truy vấn vô ích, thưa hơn thì người dùng
    // chờ quá lâu cho một việc mà lẽ ra chỉ mất vài chục giây.
    reconcileSchedule: process.env.RECONCILE_CRON_SCHEDULE ?? '*/10 * * * *',
  },

  throttle: {
    /// Trần chung cho mọi route, tính theo IP trong một phút.
    ///
    /// Rộng tay có chủ đích: nó là lưới chặn kẻ quét chứ không phải hạn mức sử
    /// dụng. Những route thật sự tốn kém có trần riêng chặt hơn nhiều, khai ngay
    /// tại route đó bằng `@Throttle`.
    ttlMs: parseInt(process.env.THROTTLE_TTL_MS ?? '60000', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '120', 10),

    /// Tắt hoàn toàn rate limiting. CHỈ dùng cho test tích hợp.
    ///
    /// Cần một công tắc ở tầng cấu hình vì không tắt được từ phía test: guard
    /// đăng ký qua token `APP_GUARD`, nên `overrideGuard(ThrottlerGuard)` của
    /// Nest không chạm tới nó. Và tắt là bắt buộc — gần như test nào cũng đăng ký
    /// một tài khoản, sẽ đụng trần 10 lần/phút rồi đỏ vì 429 chứ không phải vì
    /// thứ chúng đang kiểm.
    ///
    /// Mặc định BẬT rate limiting: quên đặt biến này ở production thì hệ thống
    /// vẫn được bảo vệ, chứ không phải ngược lại.
    disabled: process.env.THROTTLE_DISABLED === 'true',
  },

  latex: {
    /**
     * URL của dịch vụ compile LaTeX. Có giá trị thì dùng `HttpLatexCompiler`
     * (production), bỏ trống thì dùng `SandboxLatexCompiler` gọi `docker run` (máy
     * phát triển).
     *
     * Mặc định là BỎ TRỐNG, tức đường Docker. Chọn vậy vì môi trường phát triển là
     * nơi không có dịch vụ nào chạy sẵn; còn ở production thì thiếu biến này sẽ hỏng
     * NGAY và nói rõ ("Máy chủ chưa bật được môi trường tạo PDF") chứ không âm thầm
     * chạy sai.
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
