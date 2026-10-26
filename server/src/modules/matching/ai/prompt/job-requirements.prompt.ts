import type { Job } from '@/generated/prisma/client';

export const BATCH_MAX_DESCRIPTION = 6_000;

export const BATCH_TIMEOUT_MS = 120_000;

export const SYSTEM = [
  'Bạn rút trích YÊU CẦU từ một tin tuyển dụng. Không đánh giá ứng viên nào - tin này sẽ được đối chiếu với nhiều hồ sơ khác nhau.',
  '',
  'Quy tắc bắt buộc:',
  '- Chỉ ghi những gì tin VIẾT RA. Không suy diễn, không thêm kỹ năng "thường đi kèm".',
  '- Ghi ĐỦ mọi yêu cầu trong phần yêu cầu ứng viên, kể cả khi có hơn 10 mục. Bỏ sót một yêu cầu thì ứng viên không biết mình thiếu gì.',
  '- Phần mô tả công việc là việc SẼ làm, không phải yêu cầu: từ đó chỉ lấy công cụ, công nghệ được nêu tên, không lấy đầu việc ("giám sát", "bóc tách khối lượng", "lập báo cáo").',
  '- Xếp mức theo TỪNG CÂU chứ không theo tiêu đề mục: câu có "ưu tiên", "là lợi thế", "điểm cộng", "nice to have", "is a plus", "preferred" là ưu tiên, dù nằm dưới tiêu đề "Yêu cầu".',
  '',
  'LỰA CHỌN THAY NHAU: yêu cầu cho chọn một trong vài thứ thì ghi THÀNH MỘT phần tử với nhiều `options`.',
  '- "tiếng Anh hoặc tiếng Hàn" -> ["Tiếng Anh", "Tiếng Hàn"]. "Premiere Pro hoặc CapCut" -> ["Premiere Pro", "CapCut"]. "Trưởng ca/ Quản lý cửa hàng" -> ["Trưởng ca", "Quản lý cửa hàng"].',
  '- "Message Queue (Kafka, RabbitMQ)", "thành thạo một trong các database: Oracle, SQL Server, PostgreSQL" -> một phần tử, mỗi tên một option.',
  '- Tin đòi TẤT CẢ ("thành thạo HTML, CSS, JavaScript") thì mỗi thứ một phần tử riêng.',
  '',
  'PHÉP THỬ cho mỗi mục trước khi ghi: "một ứng viên có khai mục này trong phần Kỹ năng hay Chứng chỉ của CV không?"',
  '- ĐƯỢC: Kubernetes, Python, kế toán thuế, AutoCAD, tiếng Trung, giao tiếp, đàm phán, chăm sóc khách hàng, chứng chỉ hành nghề điều dưỡng, bằng lái xe B2.',
  '- KHÔNG ĐƯỢC: "SLO bốn số chín", "vận hành xuất sắc", "quản lý đội ngũ", phẩm chất như "trách nhiệm", "chịu áp lực", "nhanh nhẹn".',
  '- KHÔNG ghi kỹ năng chung mọi nghề đều nói: "làm việc nhóm", "làm việc độc lập", "giải quyết vấn đề", "xử lý tình huống", "quản lý thời gian", "cẩn thận", "attention to detail". Giao tiếp, đàm phán, thuyết phục, tư vấn thì ghi được.',
  '- KHÔNG ghi điều kiện cá nhân: tuổi, giới tính, ngoại hình, sức khoẻ, phương tiện đi lại, sẵn sàng đi công tác hay làm ca.',
  '  Đó là kết quả, phẩm chất hoặc trách nhiệm - không ai khai chúng thành kỹ năng, nên ghi vào chỉ làm mọi hồ sơ trượt oan.',
  '- KHÔNG ghi bằng cấp, học vị hay NGÀNH HỌC: "tốt nghiệp chuyên ngành Cơ khí, Điện, Marketing" thì Cơ khí, Điện, Marketing là ngành học, không ghi. Điểm IELTS/TOEIC ghi thành ngoại ngữ ("Tiếng Anh").',
  '- Chứng chỉ hành nghề, giấy phép, bằng lái: chỉ ghi khi tin nêu tên cụ thể.',
  '- Mỗi mục tối đa 5 từ, viết bằng ngôn ngữ của tin. Ưu tiên tên riêng (React, AWS) hơn diễn đạt dài.',
  '- Chữ "C" đứng cạnh .NET hoặc ASP.NET là C# bị mất dấu #: ghi "C#".',
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

export function batchPrompt(jobs: Job[]): string {
  return jobs
    .map((job, offset) => `=== TIN [${offset + 1}] ===\n${jobPrompt(job)}`)
    .join('\n\n');
}
