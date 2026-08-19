import { z } from 'zod';

/**
 * Yêu cầu rút ra từ MỘT tin tuyển dụng, không phụ thuộc ứng viên nào.
 *
 * Rút một lần cho mỗi tin rồi đối chiếu với mọi hồ sơ bằng phép so sánh thuần —
 * đó là thứ đưa số lời gọi model từ (số người × số tin) xuống còn (số tin).
 */
export const jobRequirementsSchema = z.object({
  requiredSkills: z
    .array(z.string().min(1).max(80))
    .max(10)
    .describe(
      'Tối đa 8 kỹ năng BẮT BUỘC, mỗi mục 1-5 TỪ và phải là thứ một hồ sơ có thể khai. Công nghệ ("Kubernetes"), nghiệp vụ ("kế toán thuế"), hoặc lĩnh vực ("fintech"). TUYỆT ĐỐI không ghi kết quả công việc ("SLO bốn số chín"), phẩm chất ("tinh thần trách nhiệm") hay trách nhiệm ("quản lý đội ngũ"). Không ghi bằng cấp hay học vị - chỉ ghi kỹ năng/thông số.',
    ),
  niceToHaveSkills: z
    .array(z.string().min(1).max(80))
    .max(10)
    .describe(
      'Kỹ năng tin ghi là ưu tiên hoặc "là một lợi thế". Cùng ràng buộc như requiredSkills: 1-5 từ, phải khai được trong hồ sơ.',
    ),

  minYears: z
    .number()
    .int()
    .min(0)
    .max(40)
    .nullable()
    .describe(
      'Số năm kinh nghiệm tối thiểu. null nếu tin không nêu con số nào.',
    ),
  seniority: z
    .enum([
      'INTERN',
      'FRESHER',
      'JUNIOR',
      'MIDDLE',
      'SENIOR',
      'LEAD',
      'UNKNOWN',
    ])
    .describe('Cấp bậc tin nhắm tới, suy từ chức danh và yêu cầu.'),

  citizenshipRequired: z
    .string()
    .max(80)
    .nullable()
    .describe(
      'Quốc tịch hoặc thường trú mà tin ĐÒI HỎI. null nếu tin không nhắc tới - tuyệt đối không suy diễn.',
    ),
  /** `preprocess` nuốt null: model thấy 4 field nullable kề bên là quơ null sang cả đây. */
  workPermitRequired: z
    .preprocess((value) => value ?? false, z.boolean())
    .describe(
      'true CHỈ KHI tin nêu rõ ứng viên phải tự có giấy phép lao động. Tin không nhắc tới thì false - trường này chỉ nhận true/false, không nhận null.',
    ),
  eligibilityQuote: z
    .string()
    .max(400)
    .describe(
      'Trích NGUYÊN VĂN câu chữ trong tin về quốc tịch hoặc quyền làm việc. Để trống nếu tin không nói gì.',
    ),

  city: z
    .string()
    .max(80)
    .nullable()
    .describe('Thành phố làm việc, viết như tin ghi. null nếu tin không nêu.'),
  remotePolicy: z
    .enum(['ONSITE', 'HYBRID', 'REMOTE', 'UNKNOWN'])
    .describe('Hình thức làm việc tin công bố.'),
});

export type JobRequirements = z.infer<typeof jobRequirementsSchema>;
