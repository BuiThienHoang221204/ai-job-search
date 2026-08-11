import { z } from 'zod';

/// Truy vấn tìm việc do AI sinh từ hồ sơ ứng viên.
///
/// Skill job-scraper có file search-queries.md mô tả chiến lược truy vấn theo
/// nhóm ưu tiên. Ở đây model đóng vai trò đó: đọc hồ sơ, sinh ra bộ từ khóa
/// bám sát kỹ năng và định hướng thật sự của người dùng.
export const searchPlanSchema = z.object({
  queries: z
    .array(
      z.object({
        query: z
          .string()
          .min(2)
          .max(60)
          .describe(
            'Từ khóa tìm kiếm NGẮN, 1-3 từ, bằng tiếng Anh vì tin tuyển dụng IT Việt Nam dùng tiếng Anh. Ví dụ: "reactjs", "frontend engineer", "nextjs typescript". Không đặt câu, không dùng dấu câu.',
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
      'Sắp theo độ ưu tiên giảm dần. Truy vấn đầu tiên phải bám sát kỹ năng chính và chức danh hiện tại của ứng viên.',
    ),
});

export type SearchPlan = z.infer<typeof searchPlanSchema>;
