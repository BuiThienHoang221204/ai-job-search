import type { Job } from '../../../../generated/prisma/client.js';

/** Dài hơn mức này thì đi đường lẻ. Đo 563 tin: p50 2.556, p95 5.993 — mức này giữ ~95% số tin ở đường gộp. */
export const BATCH_MAX_DESCRIPTION = 6_000;

export const SYSTEM = [
  'Bạn rút trích YÊU CẦU từ một tin tuyển dụng. Không đánh giá ứng viên nào - tin này sẽ được đối chiếu với nhiều hồ sơ khác nhau.',
  '',
  'Quy tắc bắt buộc:',
  '- Chỉ ghi những gì tin VIẾT RA. Không suy diễn, không thêm kỹ năng "thường đi kèm".',
  '- Phân biệt BẮT BUỘC với ƯU TIÊN: "yêu cầu", "must have" là bắt buộc; "là một lợi thế", "ưu tiên", "nice to have" là ưu tiên.',
  '',
  'PHÉP THỬ cho mỗi kỹ năng trước khi ghi: "một ứng viên có khai mục này trong phần Kỹ năng của CV không?"',
  '- ĐƯỢC: Kubernetes, Terraform, Python, kế toán thuế, fintech, Incident Management.',
  '- KHÔNG ĐƯỢC: "SLO bốn số chín", "vận hành xuất sắc", "ưu tiên theo dữ liệu", "quản lý đội ngũ", "thực thi dự án phức tạp".',
  '  Đó là kết quả, phẩm chất hoặc trách nhiệm - không ai khai chúng thành kỹ năng, nên ghi vào chỉ làm mọi hồ sơ trượt oan.',
  "- KHÔNG ghi bằng cấp, học vị hay chứng chỉ: Bachelor's degree, Cử nhân, IELTS không phải kỹ năng.",
  '- Mỗi kỹ năng tối đa 5 từ. Ưu tiên tên riêng (React, AWS) hơn diễn đạt dài.',
  '- Thà ghi 4 kỹ năng đúng còn hơn 14 mục trong đó 10 mục không khớp được với ai.',
  '- Quốc tịch và giấy phép lao động: chỉ điền khi tin nói rõ. Tin im lặng thì để null và false - đoán sai ở đây loại oan ứng viên đủ điều kiện.',
].join('\n');

export const BATCH_SYSTEM = [
  SYSTEM,
  '',
  'ĐẦU VÀO LÀ NHIỀU TIN, mỗi tin mở đầu bằng "=== TIN [số] ===".',
  '- Trả về MỘT phần tử cho MỖI tin, và `index` phải đúng bằng số trong ngoặc vuông của tin đó.',
  '- Xử lý từng tin ĐỘC LẬP. Tuyệt đối không mang kỹ năng của tin này sang tin khác, kể cả khi hai tin giống nhau.',
  '- Tin nào không đọc được thì vẫn trả phần tử của nó với danh sách kỹ năng rỗng, đừng bỏ qua.',
].join('\n');

/** Phần của tin thật sự đi vào prompt — `sourceHash` phải băm đúng những trường này. */
export function jobPrompt(job: Job): string {
  return [
    `Chức danh: ${job.title}`,
    `Công ty: ${job.company}`,
    `Địa điểm: ${job.location ?? 'không rõ'}`,
    `Hình thức: ${job.workMode ?? 'không rõ'}`,
    '',
    'Mô tả:',
    job.description,
  ].join('\n');
}

/** Số trong ngoặc vuông là thứ `extractMany` dùng để ánh xạ ngược, nên nó bắt đầu từ 1 chứ không từ 0. */
export function batchPrompt(jobs: Job[]): string {
  return jobs
    .map((job, offset) => `=== TIN [${offset + 1}] ===\n${jobPrompt(job)}`)
    .join('\n\n');
}
