import { z } from 'zod';

const vn = (max: number, hint: string) =>
  z.string().min(1).max(max).describe(`${hint} Viết bằng tiếng Việt có dấu.`);

export const companyVerdict = z.enum([
  'positive',
  'mixed',
  'negative',
  'no_reviews_yet',
  'unknown',
]);

/**
 * Model trả về SỐ THỨ TỰ nguồn, không trả URL: nguồn được đánh số sẵn trong
 * prompt, nên nó không có đường bịa ra một đường dẫn không tồn tại.
 */
const usedSource = z.object({
  index: z
    .number()
    .int()
    .min(1)
    .describe('Số thứ tự của nguồn trong danh sách đã cung cấp.'),
  usedFor: vn(160, 'Thông tin nào trong bản tóm tắt lấy từ nguồn này.'),
});

/**
 * Cố ý KHÔNG có `confidence`: độ tin cậy suy từ số nguồn đọc được, và đó là
 * việc của code. Hỏi model thì nó chấm theo giọng văn của chính nó.
 */
export const companyBriefSchema = z.object({
  verdict: companyVerdict.describe(
    'Kết luận chung về công ty với tư cách NƠI LÀM VIỆC. Dùng "no_reviews_yet" khi trang đánh giá CÓ tồn tại cho công ty này nhưng chưa ai viết gì (ví dụ trang ghi "Đánh giá chung 0.0" hoặc mời bạn là người đầu tiên). Dùng "unknown" khi nguồn hoàn toàn không nhắc tới môi trường làm việc.',
  ),

  summary: vn(
    700,
    'Tóm tắt 2-4 câu: làm ở đây thì được gì, mất gì. Nói thẳng, không quảng cáo.',
  ),

  pros: z
    .array(vn(140, 'Một điểm tốt cụ thể.'))
    .max(5)
    .describe('Điểm tốt do người đi làm nêu ra. Bỏ trống nếu nguồn không nêu.'),

  cons: z
    .array(vn(140, 'Một điểm hạn chế cụ thể.'))
    .max(5)
    .describe(
      'Điểm hạn chế do người đi làm nêu ra. Bỏ trống nếu nguồn không nêu.',
    ),

  rating: z
    .number()
    .min(0)
    .max(5)
    .nullable()
    .describe(
      'Điểm trung bình trên thang 5, CHỈ khi trang ghi rõ con số. Không suy đoán, không quy đổi.',
    ),

  reviewCount: z
    .number()
    .int()
    .min(0)
    .nullable()
    .describe('Số lượt đánh giá, CHỈ khi trang ghi rõ con số.'),

  usedSources: z
    .array(usedSource)
    .max(6)
    .describe(
      'Những nguồn thật sự dùng để viết bản tóm tắt. Nguồn đọc mà không rút ra được gì thì đừng liệt kê.',
    ),
});

export type CompanyBrief = z.infer<typeof companyBriefSchema>;
