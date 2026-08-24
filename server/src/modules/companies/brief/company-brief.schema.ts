import { z } from 'zod';

/**
 * Chuỗi tự do do model sinh: CẮT cho vừa trần, không từ chối cả lượt gọi.
 *
 * Đã hỏng thật ngày 2026-08-24 trên "ZIGExN VeNtura": model trả về bản tóm tắt
 * dùng được hoàn toàn, nhưng một `usedFor` dài 250 ký tự trên trần 160 và cả
 * 518 token đầu ra bị vứt. Lỗi schema cố ý KHÔNG đi tiếp chuỗi dự phòng, nên
 * người dùng mất trắng lượt chạy vì 90 ký tự thừa.
 *
 * Trần vẫn đi vào prompt qua `.describe()`, nên model vẫn được nhắc viết ngắn -
 * chỉ khác là viết dài không còn là lỗi chí mạng. Structured output của gateway
 * ép HÌNH DẠNG chứ gần như không ép `maxLength`, nên đổi model không thay được
 * chỗ này.
 */
const vn = (max: number, hint: string) =>
  z
    .string()
    .describe(`${hint} Tối đa ${max} ký tự. Viết bằng tiếng Việt có dấu.`)
    .transform((value) => value.trim().slice(0, max));

/** Bỏ mục rỗng rồi cắt cho vừa số lượng, thay vì từ chối khi model liệt kê thừa. */
const boundedList = (item: z.ZodType<string, string>, max: number) =>
  z
    .array(item)
    .transform((items) => items.filter((s) => s.length > 0).slice(0, max));

/**
 * `catch` để một nhãn lạ không giết cả bản tóm tắt: phần chữ vẫn dùng được, chỉ
 * mất đúng cái nhãn màu trên giao diện.
 */
export const companyVerdict = z
  .enum(['positive', 'mixed', 'negative', 'no_reviews_yet', 'unknown'])
  .catch('unknown');

/**
 * Model trả về SỐ THỨ TỰ nguồn, không trả URL: nguồn được đánh số sẵn trong
 * prompt, nên nó không có đường bịa ra một đường dẫn không tồn tại. Số ngoài
 * khoảng bị `resolveSources` bỏ, nên ở đây không cần chặn.
 */
const usedSource = z.object({
  index: z
    .number()
    .int()
    .describe('Số thứ tự của nguồn trong danh sách đã cung cấp.'),
  usedFor: vn(240, 'Thông tin nào trong bản tóm tắt lấy từ nguồn này.'),
});

/** Điểm ngoài thang 5 thành `null`: nhiều khả năng model đọc thang khác. */
const ratingOutOfFive = z
  .number()
  .nullable()
  .describe(
    'Điểm trung bình trên thang 5, CHỈ khi trang ghi rõ con số. Không suy đoán, không quy đổi.',
  )
  .transform((value) =>
    value === null || value < 0 || value > 5 ? null : value,
  );

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

  pros: boundedList(vn(140, 'Một điểm tốt cụ thể.'), 5).describe(
    'Điểm tốt do người đi làm nêu ra. Bỏ trống nếu nguồn không nêu.',
  ),

  cons: boundedList(vn(140, 'Một điểm hạn chế cụ thể.'), 5).describe(
    'Điểm hạn chế do người đi làm nêu ra. Bỏ trống nếu nguồn không nêu.',
  ),

  rating: ratingOutOfFive,

  reviewCount: z
    .number()
    .int()
    .nullable()
    .describe('Số lượt đánh giá, CHỈ khi trang ghi rõ con số.')
    .transform((value) => (value === null || value < 0 ? null : value)),

  usedSources: z
    .array(usedSource)
    .describe(
      'Những nguồn thật sự dùng để viết bản tóm tắt. Nguồn đọc mà không rút ra được gì thì đừng liệt kê.',
    )
    .transform((items) => items.slice(0, 6)),
});

export type CompanyBrief = z.infer<typeof companyBriefSchema>;
