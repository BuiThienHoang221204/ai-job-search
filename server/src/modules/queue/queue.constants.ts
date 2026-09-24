/** Tên hàng đợi. File này KHÔNG import gì — nhờ vậy `queue-key.ts` dùng được mà không tạo phụ thuộc vòng với `queue.service.ts`. */
export const QUEUE = {
  /** Chấm điểm một cặp (user, job). Đây là đường GHI của màn hình dashboard. */
  EVALUATE_MATCH: 'match.evaluate',
  /** Soạn bộ câu hỏi phỏng vấn cho một công việc. */
  INTERVIEW_PREP: 'interview.prep',
  /** Tổng hợp thiếu hụt kỹ năng trên toàn bộ công việc đã chấm. */
  UPSKILL_REPORT: 'upskill.report',
  /** Sinh CV / thư xin việc / câu trả lời form. */
  GENERATE_DOCUMENT: 'document.generate',
  /** Quét tin tuyển dụng từ portal rồi đẩy từng tin sang match.evaluate. */
  SCRAPE_RUN: 'scrape.run',
  /** Đọc CV/nguồn ngoài thành một ĐỀ XUẤT hồ sơ, chờ người dùng xác nhận. */
  PROFILE_SYNTHESIZE: 'profile.synthesize',
  /** Rút yêu cầu của MỘT tin, dùng chung cho mọi hồ sơ. Pha A. */
  EXTRACT_REQUIREMENTS: 'job.requirements',
  /** Tìm hiểu một công ty từ các trang đánh giá công khai. Khoá theo công ty, không theo người dùng. */
  COMPANY_BRIEF: 'company.brief',
  /** Đối chiếu hồ sơ với yêu cầu đã rút. Thuần CPU, KHÔNG gọi model. */
  REQUIREMENT_MATCH: 'match.requirements',
  /** Quy các cách viết kỹ năng về một mã chuẩn. Chạy TRƯỚC bước đối chiếu. */
  SKILL_CANONICALIZE: 'skill.canonicalize',
  /** Chọn suất chấm bằng AI trong hạn ngạch. Serial, xem `queue.defaults.ts`. */
  AI_SHORTLIST: 'match.shortlist',
} as const;

/** Policy áp cho MỌI hàng đợi — `singletonKey` một mình không chặn trùng trên policy `standard`. */
export const QUEUE_POLICY = 'exclusive';
