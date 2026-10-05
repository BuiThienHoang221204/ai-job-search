/** Một "lõi" — gateway phục vụ model. Cố ý là DỮ LIỆU chứ không phải class Nest: 146/185 provider của catalog dùng chung một adapter, nên class cho mỗi lõi sẽ là class không có hàm nào. */
export type ProviderDescriptor = {
  /** Khoá trong model catalog, và tiền tố trong `MODEL_FALLBACK_IDS`. */
  id: string;

  /** Tên hiển thị trong log. */
  label: string;

  /** Chỉ dùng để câu báo lỗi nói đúng chỗ cần sửa; giá trị thật do `configuration.ts` đọc. */
  apiKeyEnv: string;

  /** Có mặt vì một lõi đã ĐO được là phân biệt đối xử theo User-Agent. Khai bằng biến môi trường để tắt được mà không phải build lại. */
  userAgentEnv?: string;

  baseURLEnv?: string;

  /** Trần đồng thời phía APP cho lõi này, qua `ConcurrencyGate` — chỉ cần khai khi lõi có trần vật lý thật (vd container riêng chỉ nhận N tiến trình cùng lúc). Bỏ trống = không giới hạn. */
  maxConcurrencyEnv?: string;

  honorsResponseFormat?: boolean;

  extraHeaders?: Record<string, string>;

  explicitStreamFlag?: boolean;

  /** Đọc MỘT phần tử `data[]` của `GET /models`: gateway có KHAI model này giữ được structured output không. Bỏ trống = gateway không khai gì. */
  declaresStructuredOutput?: (entry: Record<string, unknown>) => boolean;

  /** Danh sách CHẶN, cố ý không phải danh sách cho phép: model chưa đo thì vẫn được thử, model đã biết là hỏng thì không tốn thêm lượt gọi nào. */
  knownNoStructuredOutput?: readonly string[];

  /** Ngược lại là danh sách CHO PHÉP, chỉ dùng cho lõi `honorsResponseFormat: false`: model đã ĐO là stream ra JSON parse dần được. `'all'` = mọi model của lõi. */
  streamsJson?: readonly string[] | 'all';

  /** Trần đo được của MỘT model — khác nhau theo từng model trong cùng lõi nên là hàm, không phải số tĩnh. Mảng vì một model có thể bị chặn bởi NHIỀU trần cùng lúc (vd Gemini: RPM 5 VÀ RPD 20 — thoả RPM không có nghĩa thoả RPD), `fast-model-scheduler.ts` đòi thoả MỌI phần tử mới coi là còn chỗ. Bỏ trống = chưa đo, coi như luôn còn chỗ. */
  rateLimitFor?: (modelId: string) => readonly RateLimitSpec[] | undefined;

  /** Danh sách model CỐ ĐỊNH, dùng khi gateway không hỗ trợ `GET /models` (đo thật: Cloudflare trả 405) — `ModelCatalogService.catalogFor` dùng danh sách này thay cho việc tự dò. */
  staticModels?: readonly string[];

  /** Trần output MẶC ĐỊNH của riêng lõi này quá nhỏ cho model reasoning (đo thật: Cloudflare tự cắt ở 256 token, model reasoning tiêu hết vào suy luận nội bộ, `content` ra null) — đặt cao hơn ở đây để ghi đè, thay vì để `AiService` không set gì (mặc định đúng cho mọi lõi khác). */
  defaultMaxOutputTokens?: number;
};

/** `count`: đếm LƯỢT trong `windowMs` (đo UnoRouter: đúng 1/phút). `token`: cộng dồn token trong `windowMs`, so với TPM (đo Groq: TPM là trần thật, RPM trên giấy không phản ánh đúng với prompt nặng). */
export type RateLimitSpec = {
  kind: 'count' | 'token';
  windowMs: number;
  limit: number;
};
