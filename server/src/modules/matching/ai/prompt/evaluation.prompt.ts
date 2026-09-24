import type { Job } from '../../../../generated/prisma/client.js';

/** Mục của khung đánh giá được giữ lại; đổi tiêu đề trong `.md` thì `keepSections` trả về RỖNG. */
export const EVALUATION_SECTIONS = [
  'eligibility gate',
  'scoring dimensions',
  'weighting',
  'thresholds',
];

/** Dựng prompt chấm điểm từ khung đã tra sẵn; hàm này không tự đọc file skill lẫn database. */
export function evaluationPrompt(
  framework: string,
  profileSummary: string,
  job: Job,
): { system: string; prompt: string } {
  const system = [
    'Bạn là cố vấn nghề nghiệp, đánh giá mức độ phù hợp giữa một ứng viên và một tin tuyển dụng.',
    'Áp dụng ĐÚNG khung đánh giá dưới đây. Không tự bịa thêm chiều đánh giá mới.',
    '',
    'Quy tắc bắt buộc:',
    '- Chạy Eligibility Gate TRƯỚC, theo đúng thứ tự sau:',
    '  1. Tin đòi quốc tịch hoặc thường trú mà ứng viên không đáp ứng -> FAIL, kèm trích nguyên văn câu chữ đó.',
    '  2. Ứng viên là công dân của chính nước đặt vị trí tuyển dụng -> PASS.',
    '  3. Còn lại (tin im lặng về quyền làm việc và ứng viên không phải công dân nước sở tại) -> UNVERIFIED.',
    '- MỌI điểm đều chấm trên thang 0-100. Không dùng thang 0-5 hay 0-10.',
    '- Chỉ chấm điểm dựa trên thông tin có thật trong hồ sơ. Mục nào hồ sơ ghi "(hồ sơ chưa cung cấp thông tin này)" thì chấm điểm thấp và nói rõ là thiếu dữ liệu, tuyệt đối không suy diễn.',
    '- KHÔNG tính điểm tổng. Hệ thống tự tính theo trọng số.',
    '- Mọi ghi chú và mọi phần tử trong strengths/gaps phải là MỘT CÂU tiếng Việt có dấu hoàn chỉnh, không phải cụm từ rời rạc hay danh sách từ khóa.',
    '',
    '--- KHUNG ĐÁNH GIÁ ---',
    framework,
  ].join('\n');

  const prompt = [
    '=== HỒ SƠ ỨNG VIÊN ===',
    profileSummary,
    '',
    '=== TIN TUYỂN DỤNG ===',
    `Chức danh: ${job.title}`,
    `Công ty: ${job.company}`,
    `Địa điểm: ${job.location ?? 'không rõ'}`,
    `Hình thức: ${job.workMode ?? 'không rõ'}`,
    `Lương: ${job.salaryRaw ?? 'không công bố'}`,
    `Từ khóa: ${job.tags.join(', ') || 'không có'}`,
    '',
    'Mô tả:',
    job.description,
  ].join('\n');

  return { system, prompt };
}
