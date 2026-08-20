import { z } from 'zod';

/** Truy vấn tìm việc do AI sinh từ hồ sơ ứng viên. */
export const searchPlanSchema = z.object({
  queries: z
    .array(
      z.object({
        query: z
          .string()
          .min(2)
          .max(60)
          .describe(
            'Từ khóa tìm kiếm NGẮN, 1-4 từ. Ngành CNTT và kỹ thuật dùng TIẾNG ANH ("reactjs", "frontend engineer", "devops engineer"); mọi ngành khác dùng TIẾNG VIỆT CÓ DẤU ("kế toán tổng hợp", "nhân viên kinh doanh", "chuyên viên tuyển dụng"). Không đặt câu, không dùng dấu câu.',
          ),
        location: z
          .string()
          .max(40)
          .describe(
            'Tên thành phố viết KHÔNG DẤU. Chỉ dùng một trong: "Ho Chi Minh", "Ha Noi", "Da Nang". Để trống nếu tìm cả nước.',
          ),
        rationale: z
          .string()
          .min(1)
          .max(200)
          .describe('Vì sao truy vấn này hợp với hồ sơ. Tiếng Việt có dấu.'),
      }),
    )
    .min(2)
    .max(6)
    .describe(
      'Sắp theo độ ưu tiên giảm dần. Truy vấn đầu tiên phải là CHỨC DANH hiện tại của ứng viên; các truy vấn sau ghép chức danh với lĩnh vực mục tiêu, rồi mới tới kỹ năng chính.',
    ),
});

export type SearchPlan = z.infer<typeof searchPlanSchema>;
