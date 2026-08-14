import { z } from 'zod';

/**
 * Hình dạng hồ sơ do model đề xuất từ bằng chứng.
 *
 * Hai nguyên tắc quyết định file này, và cả hai đều quan trọng hơn việc trích được
 * nhiều trường.
 *
 * **1. Chỉ đề xuất những gì bằng chứng CHỨNG MINH được.** Mọi trường đều
 * `optional`: một CV không nhắc tới học vấn thì model phải bỏ trống, không được
 * đoán. Vì vậy schema này KHÔNG có `min(1)` trên mảng — mảng rỗng là câu trả lời
 * hợp lệ và trung thực.
 *
 * **2. Có những trường model KHÔNG ĐƯỢC đề xuất, dù `Profile` có chúng.** Cụ thể:
 *
 * - `careerGoals`, `energizingTasks`, `drainingTasks`, `targetSectors`,
 *   `dealBreakers` — đây là **sở thích và ý muốn**. Một CV không nói việc gì làm
 *   bạn kiệt sức. Suy ra từ chức danh cũ là bịa, và nó bịa vào đúng phần chiếm
 *   30% điểm phù hợp (chiều Định hướng nghề nghiệp), tức là làm lệch toàn bộ kết
 *   quả chấm điểm về sau.
 * - `citizenship`, `workPermit`, `workPermitNote` — **tình trạng pháp lý**. Đoán
 *   sai ở đây làm sai Eligibility Gate, mà Gate là bộ lọc CỨNG: một suy đoán sai
 *   loại thẳng ứng viên khỏi những việc họ đủ điều kiện làm. "Sinh ở Hà Nội" không
 *   chứng minh được quốc tịch hay giấy phép lao động.
 * - `commuteConstraint`, `willingToRelocate`, `remotePreference` — cũng là sở
 *   thích, và `willingToRelocate` là boolean nên mặc định sai sẽ im lặng hoàn toàn.
 * - `lackingSkills` — trường này suy ra từ việc ĐỐI CHIẾU hồ sơ với tin tuyển
 *   dụng (đó là việc của `upskill`), không phải đọc từ CV. Một CV không liệt kê
 *   những gì nó thiếu.
 *
 * Người dùng tự điền những trường đó ở màn Hồ sơ. Đó không phải thiếu sót của
 * Agent 1 mà là ranh giới của nó.
 */

const line = (max: number, hint: string) =>
  z.string().min(1).max(max).describe(hint);

/// Khớp `ExperienceItem` ở frontend, TRỪ `id` — id do frontend sinh khi người
/// dùng áp dụng bản nháp. Model không được đặt id.
const experienceItem = z.object({
  company: line(160, 'Tên công ty, ghi đúng như trong CV.'),
  position: line(160, 'Chức danh.'),
  period: line(60, 'Khoảng thời gian, ví dụ "03/2022 – nay".'),
  location: z
    .string()
    .max(160)
    .optional()
    .describe('Địa điểm làm việc, bỏ trống nếu CV không ghi.'),
  highlights: z
    .array(line(400, 'Một gạch đầu dòng thành tựu, giữ nguyên con số nếu có.'))
    .max(8)
    .describe(
      'Các gạch đầu dòng của vị trí này. Giữ nguyên số liệu; KHÔNG tự thêm số nào không có trong CV.',
    ),
});

const educationItem = z.object({
  school: line(200, 'Tên trường.'),
  degree: line(160, 'Bậc/loại bằng, ví dụ "Cử nhân".'),
  field: line(160, 'Ngành học.'),
  period: z.string().max(60).optional(),
  gpa: z
    .string()
    .max(40)
    .optional()
    .describe('Chỉ điền khi CV ghi rõ. KHÔNG quy đổi thang điểm.'),
});

const certificateItem = z.object({
  name: line(200, 'Tên chứng chỉ.'),
  issuer: z
    .string()
    .max(160)
    .optional()
    .describe('Tổ chức cấp, nếu CV có ghi.'),
  year: z.string().max(20).optional().describe('Năm cấp, nếu CV có ghi.'),
});

const projectItem = z.object({
  name: line(200, 'Tên dự án.'),
  description: line(600, 'Dự án làm gì, một tới ba câu.'),
  technologies: z.array(z.string().min(1).max(60)).max(20),
  period: z.string().max(60).optional(),
});

export const profileProposalSchema = z.object({
  headline: z
    .string()
    .max(200)
    .optional()
    .describe(
      'Một dòng mô tả bản thân, ví dụ "Kỹ sư Backend 5 năm kinh nghiệm". Lấy từ CV, không tự nghĩ ra.',
    ),
  location: z
    .string()
    .max(200)
    .optional()
    .describe('Tỉnh/thành đang sống, chỉ điền nếu CV ghi.'),
  country: z.string().max(120).optional(),
  summary: z
    .string()
    .max(4_000)
    .optional()
    .describe(
      'Đoạn giới thiệu. Được viết lại cho gọn nhưng KHÔNG thêm thông tin mới.',
    ),
  languages: z
    .array(z.string().min(1).max(80))
    .max(12)
    .describe('Ngôn ngữ, kèm trình độ nếu CV ghi. Bỏ trống nếu CV không nhắc.'),

  primarySkills: z
    .array(z.string().min(1).max(80))
    .max(30)
    .describe(
      'Kỹ năng CV thể hiện là thành thạo: xuất hiện trong mục kỹ năng CHÍNH hoặc gắn với công việc thật.',
    ),
  secondarySkills: z
    .array(z.string().min(1).max(80))
    .max(30)
    .describe('Kỹ năng chỉ mới tiếp xúc hoặc dùng ở mức phụ.'),

  directExperienceDomains: z
    .array(z.string().min(1).max(120))
    .max(15)
    .describe(
      'Lĩnh vực đã làm trực tiếp, ví dụ "thương mại điện tử", "fintech".',
    ),
  adjacentExperience: z
    .array(z.string().min(1).max(120))
    .max(15)
    .describe('Lĩnh vực liên quan gần, chưa làm trực tiếp.'),

  experiences: z.array(experienceItem).max(15),
  educations: z.array(educationItem).max(10),
  certificates: z.array(certificateItem).max(20),
  projects: z.array(projectItem).max(15),

  /**
   * Những gì model KHÔNG tìm thấy trong bằng chứng.
   *
   * Đây là trường có giá trị bậc nhất ở màn xác nhận, và nó ép model phải thừa
   * nhận giới hạn thay vì lấp chỗ trống. Không có nó, một CV thiếu học vấn chỉ
   * cho ra `educations: []` — trông y như một lỗi đọc.
   */
  missing: z
    .array(line(200, 'Một thông tin hồ sơ cần mà bằng chứng không có.'))
    .max(15)
    .describe(
      'Liệt kê những phần KHÔNG suy ra được từ bằng chứng, để người dùng tự bổ sung. Viết bằng tiếng Việt.',
    ),

  /**
   * Ghi chú của model về độ tin cậy của chính nó.
   *
   * Ví dụ: "CV không ghi năm tốt nghiệp nên khoảng thời gian học vấn để trống".
   */
  notes: z
    .array(line(300, 'Một điểm cần lưu ý về cách đọc bằng chứng.'))
    .max(10),
});

export type ProfileProposal = z.infer<typeof profileProposalSchema>;
