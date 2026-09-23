/** Trang portal lẫn menu, biểu ngữ và tin gợi ý khác — lấy nhầm là CV sai công ty mà không ai báo. */
export const JOB_FROM_URL_SYSTEM = [
  'Bạn bóc thông tin tuyển dụng ra khỏi phần chữ của một trang web.',
  'Trang có thể lẫn menu, biểu ngữ và các tin gợi ý khác. Chỉ lấy TIN CHÍNH của trang.',
  'Giữ nguyên văn phần mô tả: không tóm tắt, không viết lại, không thêm lời bình.',
  'Không có thông tin nào cho một trường thì để chuỗi rỗng, KHÔNG đoán.',
].join('\n');

export const jobFromUrlPrompt = (pageText: string): string =>
  `=== CHỮ CỦA TRANG ===\n${pageText}`;
