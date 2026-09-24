export type PortalJobCard = {
  id: string;
  slug: string;
  title: string;
  company: string | null;
  companyUrl: string | null;
  companyLogo: string | null;
  location: string | null;
  workMode: string | null;
  salary: string | null;
  postedAt: string | null;
  tags: string[];
  url: string;
  /** Có giá trị khi portal trả sẵn mô tả ngay trong kết quả tìm kiếm. */
  description?: string | null;
};

export type PortalJobDetail = PortalJobCard & { description: string | null };

export type SearchArgs = {
  query?: string;
  location?: string;
  remote?: 'remote' | 'hybrid' | 'onsite';
  page?: number;
  limit?: number;
  /** Chỉ portal khai `jobAge: true` mới lọc được ở đầu kia; còn lại lọc sau khi nhận thẻ. */
  postedWithinDays?: number;
};

export type PortalEntry = {
  key: string;
  directory: string;
  /** Đường dẫn CLI tương đối so với gốc repo, dùng làm tham số cho `bun run`. */
  cliPath: string;
  enabled: boolean;
  /** Portal tự lọc được theo ngày đăng (LinkedIn có --jobage). */
  supportsJobAge: boolean;
  description: string;
};

/** SEAM 5 — nơi tin tuyển dụng đến từ. `JobSourceRouter` được tiêm bằng chính lớp, không qua token. */
export interface JobSource {
  /** Quét lại danh sách nguồn. Gọi được lúc chạy để nhận nguồn mới. */
  reload(): Promise<PortalEntry[]>;
  listPortals(): string[];
  describePortals(): PortalEntry[];
  has(portal: string): boolean;
  search(portal: string, args: SearchArgs): Promise<PortalJobCard[]>;
  detail(portal: string, slug: string): Promise<PortalJobDetail>;
}

export type PlannedQuery = {
  query: string;
  location: string;
  rationale: string;
};

export type QueryProfile = {
  headline: string | null;
  location: string | null;
  primarySkills: string[];
  targetSectors: string[];
};

export type ProfileCluster = {
  clusterCode: string;
  query: string;
  size: number;
};

export type ClusterProfile = {
  headline: string | null;
  primarySkills: string[];
  occupationCode: string | null;
};

export type CollectLimits = {
  maxJobsPerPortal: number;
  maxPages: number;
  maxAgeDays: number;
  requirePostedAt: boolean;
  defaultLocation: string;
};

/** Vị trí duyệt của MỘT truy vấn, giữ qua các lượt chia hạn ngạch. */
export type QueryCursor = {
  query: PlannedQuery;
  /** Trang sẽ lấy tiếp. Không quay lại từ đầu ở lượt chia phần dư. */
  page: number;
  /** Số tin truy vấn này đã đóng góp, dùng để so với hạn ngạch riêng. */
  taken: number;
  /** Đã hết tin hoặc trang cuối không thêm được gì. */
  done: boolean;
  /** Thẻ đã tải nhưng chưa nhận vì chạm hạn ngạch — thiếu đệm này thì dừng giữa trang là vứt luôn phần còn lại. */
  pending: PortalJobCard[];
  /** Số tin nhận được từ trang đang tiêu thụ. Đặt lại mỗi lần tải trang mới. */
  gained: number;
  /** Đã gửi được ít nhất một request; `markCrawled` chỉ đóng dấu nghề có cờ này. */
  requested: boolean;
};

/** Những thứ việc thu thập cần từ bên ngoài. Không tự dựng cái nào. */
export type CollectDeps = {
  search: (portal: string, args: SearchArgs) => Promise<PortalJobCard[]>;
  log: (message: string) => void;
  limits: CollectLimits;
};

export type CollectOutcome = {
  cards: PortalJobCard[];
  askedIndices: number[];
};

/** Số phận của MỘT tin sau khi lưu. */
export type SaveResult =
  { kind: 'saved'; jobId: string } | { kind: 'skipped' } | { kind: 'merged' };

/** Kết quả một lượt lưu, đủ để ghi vào `ScrapeRun` và viết log. */
export type SaveOutcome = {
  /** Id những tin MỚI đã lưu và không phải bản sao. Đầu vào của việc nền. */
  savedJobIds: string[];
  /** Tổng số thẻ đưa vào. */
  found: number;
  /** Số thẻ chưa có trong database. */
  fresh: number;
  /** Bỏ vì mô tả quá ngắn hoặc lưu hỏng. */
  skipped: number;
  /** Lưu nhưng gắn `duplicateOfId` vì đã có bản gốc ở portal khác. */
  merged: number;
};

export type ScoreTarget = { userId: string; jobId: string };

export type FanOutJob = {
  id: string;
  /** Tiêu đề + mô tả, dùng để đối chiếu từ khoá. */
  text: string;
};

export type FanOutUser = {
  id: string;
  completion: number;
  /** primarySkills + secondarySkills. */
  skills: string[];
};

export type FanOutInput = {
  /** Các tin VỪA được lưu trong lần quét này. */
  jobs: FanOutJob[];
  users: FanOutUser[];
  /** Cặp (user, job) ĐÃ có kết quả chấm, để không chấm lại. */
  alreadyScored: Iterable<string>;
  perUserLimit?: number;
};

export type FanOutResult = {
  targets: ScoreTarget[];
  /** Số lượt bị cắt vì chạm hạn ngạch. Phải BÁO ra, không được lặng lẽ cắt. */
  dropped: number;
  skippedThinProfiles: number;
  /** Số cặp bị loại vì không dính lấy một kỹ năng nào. Cũng phải BÁO ra. */
  skippedNoOverlap: number;
};
