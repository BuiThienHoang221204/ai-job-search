import { z } from 'zod';
import {
  boundedInt,
  boundedList,
  cappedText,
  looseEnum,
  optionalCappedText,
  optionalYears,
} from '../../../common/model-output.js';

export const jobRequirementsSchema = z.object({
  requiredSkills: boundedList(
    cappedText(80, 'Một kỹ năng bắt buộc, 1-5 từ.'),
    10,
  ).describe(
    'Tối đa 8 kỹ năng BẮT BUỘC, mỗi mục 1-5 TỪ và phải là thứ một hồ sơ có thể khai. Công nghệ ("Kubernetes"), nghiệp vụ ("kế toán thuế"), hoặc lĩnh vực ("fintech"). TUYỆT ĐỐI không ghi kết quả công việc ("SLO bốn số chín"), phẩm chất ("tinh thần trách nhiệm") hay trách nhiệm ("quản lý đội ngũ"). Không ghi bằng cấp hay học vị - chỉ ghi kỹ năng/thông số.',
  ),

  niceToHaveSkills: boundedList(
    cappedText(80, 'Một kỹ năng ưu tiên, 1-5 từ.'),
    10,
  )
    .describe(
      'Kỹ năng tin ghi là ưu tiên hoặc "là một lợi thế". Cùng ràng buộc như requiredSkills: 1-5 từ, phải khai được trong hồ sơ.',
    )
    .default([]),

  minYears: optionalYears(
    40,
    'Số năm kinh nghiệm tối thiểu. null nếu tin không nêu con số nào.',
  ),

  seniority: looseEnum(
    ['INTERN', 'FRESHER', 'JUNIOR', 'MIDDLE', 'SENIOR', 'LEAD', 'UNKNOWN'],
    'UNKNOWN',
  ).describe('Cấp bậc tin nhắm tới, suy từ chức danh và yêu cầu.'),

  citizenshipRequired: optionalCappedText(
    80,
    'Quốc tịch hoặc thường trú mà tin ĐÒI HỎI. Tuyệt đối không suy diễn.',
  ),

  workPermitRequired: z
    .boolean()
    .describe('Tin có nêu rõ ứng viên phải tự có giấy phép lao động hay không.')
    .catch(false)
    .default(false),

  eligibilityQuote: cappedText(
    400,
    'Trích NGUYÊN VĂN câu chữ trong tin về quốc tịch hoặc quyền làm việc. Để trống nếu tin không nói gì.',
  ).default(''),

  city: optionalCappedText(80, 'Thành phố làm việc, viết như tin ghi.'),

  remotePolicy: looseEnum(
    ['ONSITE', 'HYBRID', 'REMOTE', 'UNKNOWN'],
    'UNKNOWN',
  ).describe('Hình thức làm việc tin công bố.'),
});

export type JobRequirements = z.infer<typeof jobRequirementsSchema>;

export const jobRequirementsBatchSchema = z.object({
  jobs: z
    .array(
      z.object({
        index: boundedInt(
          1,
          50,
          'Số thứ tự của tin, ĐÚNG như đã đánh trong danh sách đầu vào.',
        ),
        ...jobRequirementsSchema.shape,
      }),
    )
    .describe(
      'MỘT phần tử cho MỖI tin đầu vào, giữ nguyên số thứ tự đã đánh. Không gộp hai tin làm một, không bỏ sót tin nào.',
    )
    .transform((items) => items.slice(0, 50)),
});

export type JobRequirementsBatch = z.infer<typeof jobRequirementsBatchSchema>;
