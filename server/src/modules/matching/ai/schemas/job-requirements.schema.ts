import { z } from 'zod';
import {
  boundedInt,
  boundedList,
  cappedText,
  looseEnum,
  optionalCappedText,
  optionalYears,
} from '@/common/model-output';

const skillGroups = (hint: string) =>
  z
    .array(
      z.preprocess(
        (value) => (typeof value === 'string' ? { options: [value] } : value),
        z.object({
          options: boundedList(
            cappedText(80, 'Một cách đáp ứng yêu cầu, 1-5 từ.'),
            6,
          ).describe(
            'MỘT mục nếu tin đòi đúng thứ đó. NHIỀU mục khi tin cho chọn một trong số đó ("A hoặc B", "A/B", "một trong các", "Message Queue (Kafka, RabbitMQ)").',
          ),
        }),
      ),
    )
    .describe(hint)
    .transform((groups) =>
      groups
        .map((group) => group.options)
        .filter((options) => options.length > 0)
        .slice(0, 25),
    );

export const jobRequirementsSchema = z.object({
  requiredSkills: skillGroups(
    'Mọi yêu cầu BẮT BUỘC tin ghi ra, mỗi yêu cầu một phần tử. Công nghệ, công cụ, nghiệp vụ, ngoại ngữ, kỹ năng nghề (giao tiếp, đàm phán), chứng chỉ hành nghề hay bằng lái tin đòi phải có.',
  ),

  niceToHaveSkills: skillGroups(
    'Yêu cầu tin ghi là ưu tiên, là lợi thế, điểm cộng. Cùng cách ghi như requiredSkills.',
  ).default([]),

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
