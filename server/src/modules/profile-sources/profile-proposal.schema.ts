import { z } from 'zod';
import { cappedText, requiredCappedText } from '../../common/model-output.js';

/** DANH TÍNH của một mục: thiếu là cả mục vô nghĩa, từ chối mới đúng. */
const line = (max: number, hint: string) => requiredCappedText(max, hint);

/** Trường MÔ TẢ mà CV có quyền không ghi — `.min(1)` ở đây làm mất trắng cả lượt đọc, xem CLAUDE.md. */
const optionalText = (max: number, hint: string) =>
  cappedText(max, hint).default('');

/** Khớp `ExperienceItem` ở frontend, TRỪ `id` — id do frontend sinh, model không được đặt. */
const experienceItem = z.object({
  company: line(160, 'Tên công ty, ghi đúng như trong CV.'),
  position: line(160, 'Chức danh.'),
  period: optionalText(60, 'Khoảng thời gian, ví dụ "03/2022 – nay".'),
  location: z
    .string()
    .max(160)
    .optional()
    .describe('Địa điểm làm việc, bỏ trống nếu CV không ghi.'),
  highlights: z
    .array(line(400, 'Một gạch đầu dòng thành tựu, giữ nguyên con số nếu có.'))
    .transform((items) => items.slice(0, 8))
    .describe(
      'Các gạch đầu dòng của vị trí này. Giữ nguyên số liệu; KHÔNG tự thêm số nào không có trong CV.',
    ),
});

const educationItem = z.object({
  school: line(200, 'Tên trường.'),
  degree: optionalText(
    160,
    'Bậc/loại bằng, ví dụ "Cử nhân". Để trống nếu CV không ghi.',
  ),
  field: optionalText(160, 'Ngành học. Để trống nếu CV không ghi.'),
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
  technologies: z
    .array(cappedText(60, 'Một công nghệ.'))
    .transform((items) => items.slice(0, 20)),
  period: z.string().max(60).optional(),
});

/** Hình dạng hồ sơ do model đề xuất từ bằng chứng. */
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
    .array(cappedText(80, 'Một ngôn ngữ.'))
    .transform((items) => items.slice(0, 12))
    .describe('Ngôn ngữ, kèm trình độ nếu CV ghi. Bỏ trống nếu CV không nhắc.'),

  primarySkills: z
    .array(cappedText(80, 'Một kỹ năng.'))
    .transform((items) => items.slice(0, 30))
    .describe(
      'Kỹ năng CV thể hiện là thành thạo: xuất hiện trong mục kỹ năng CHÍNH hoặc gắn với công việc thật.',
    ),
  secondarySkills: z
    .array(cappedText(80, 'Một kỹ năng.'))
    .transform((items) => items.slice(0, 30))
    .describe('Kỹ năng chỉ mới tiếp xúc hoặc dùng ở mức phụ.'),

  directExperienceDomains: z
    .array(cappedText(120, 'Một lĩnh vực.'))
    .transform((items) => items.slice(0, 15))
    .describe(
      'Lĩnh vực đã làm trực tiếp, ví dụ "thương mại điện tử", "fintech".',
    ),
  adjacentExperience: z
    .array(cappedText(120, 'Một lĩnh vực.'))
    .transform((items) => items.slice(0, 15))
    .describe('Lĩnh vực liên quan gần, chưa làm trực tiếp.'),

  experiences: z.array(experienceItem).transform((items) => items.slice(0, 15)),
  educations: z.array(educationItem).transform((items) => items.slice(0, 10)),
  certificates: z
    .array(certificateItem)
    .transform((items) => items.slice(0, 20)),
  projects: z.array(projectItem).transform((items) => items.slice(0, 15)),

  /** Những gì model KHÔNG tìm thấy trong bằng chứng. */
  missing: z
    .array(line(200, 'Một thông tin hồ sơ cần mà bằng chứng không có.'))
    .transform((items) => items.slice(0, 15))
    .describe(
      'Liệt kê những phần KHÔNG suy ra được từ bằng chứng, để người dùng tự bổ sung. Viết bằng tiếng Việt.',
    ),

  /** Ghi chú của model về độ tin cậy của chính nó. */
  notes: z
    .array(line(300, 'Một điểm cần lưu ý về cách đọc bằng chứng.'))
    .transform((items) => items.slice(0, 10)),
});

export type ProfileProposal = z.infer<typeof profileProposalSchema>;
