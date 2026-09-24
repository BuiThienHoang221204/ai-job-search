import { z } from 'zod';
import type { CompanyBrief as BriefRecord } from '../../../generated/prisma/client.js';
import type { NumberedSource } from './company-brief.prompt.js';
import { boundedList, cappedTextVi } from '../../../common/model-output.js';

/** `catch` để một nhãn lạ không giết cả bản tóm tắt, chỉ mất nhãn màu. */
export const companyVerdict = z
  .enum(['positive', 'mixed', 'negative', 'no_reviews_yet', 'unknown'])
  .catch('unknown');

/** Model trả SỐ THỨ TỰ nguồn, không trả URL - nó không có đường bịa đường dẫn. */
const usedSource = z.object({
  index: z
    .number()
    .int()
    .describe('Số thứ tự của nguồn trong danh sách đã cung cấp.'),
  usedFor: cappedTextVi(
    240,
    'Thông tin nào trong bản tóm tắt lấy từ nguồn này.',
  ),
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

/** KHÔNG có `confidence`: độ tin cậy do code suy ra, hỏi model thì nó tự chấm. */
export const companyBriefSchema = z.object({
  verdict: companyVerdict.describe(
    'Kết luận chung về công ty với tư cách NƠI LÀM VIỆC. Dùng "no_reviews_yet" khi trang đánh giá CÓ tồn tại cho công ty này nhưng chưa ai viết gì (ví dụ trang ghi "Đánh giá chung 0.0" hoặc mời bạn là người đầu tiên). Dùng "unknown" khi nguồn hoàn toàn không nhắc tới môi trường làm việc.',
  ),

  summary: cappedTextVi(
    700,
    'Tóm tắt 2-4 câu: làm ở đây thì được gì, mất gì. Nói thẳng, không quảng cáo.',
  ),

  pros: boundedList(cappedTextVi(140, 'Một điểm tốt cụ thể.'), 5).describe(
    'Điểm tốt do người đi làm nêu ra. Bỏ trống nếu nguồn không nêu.',
  ),

  cons: boundedList(cappedTextVi(140, 'Một điểm hạn chế cụ thể.'), 5).describe(
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

export const VERDICTS = {
  positive: 'POSITIVE',
  mixed: 'MIXED',
  negative: 'NEGATIVE',
  no_reviews_yet: 'NO_REVIEWS_YET',
  unknown: 'UNKNOWN',
} as const;

export const CONFIDENCES = {
  high: 'HIGH',
  medium: 'MEDIUM',
  low: 'LOW',
} as const;

/** `read` đọc được cả trang · `snippet` chỉ có đoạn trích · `unreachable` tải hỏng. */
export type SourceStatus = 'read' | 'snippet' | 'unreachable';

/** Mọi nguồn ĐÃ KIỂM. `usedFor: null` = đã tra chỗ này rồi mà không có gì. */
export type BriefSource = {
  url: string;
  title: string;
  usedFor: string | null;
  status: SourceStatus;
};

export type PreparedBrief = {
  nameKey: string;
  company: string;
  sources: NumberedSource[];
  unreachable: Array<{ url: string; title: string }>;
};

export type BriefView = {
  company: string;
  researchable: boolean;
  brief: BriefRecord | null;
  stale: boolean;
};

export function resolveSources(
  brief: CompanyBrief,
  sources: NumberedSource[],
  unreachable: Array<{ url: string; title: string }>,
): BriefSource[] {
  const usedFor = new Map<number, string>();
  for (const used of brief.usedSources) {
    if (sources[used.index - 1] && !usedFor.has(used.index)) {
      usedFor.set(used.index, used.usedFor);
    }
  }

  return [
    ...sources.map((source, index) => ({
      url: source.url,
      title: source.title,
      usedFor: usedFor.get(index + 1) ?? null,
      status:
        source.kind === 'snippet' ? ('snippet' as const) : ('read' as const),
    })),
    ...unreachable.map((source) => ({
      ...source,
      usedFor: null,
      status: 'unreachable' as const,
    })),
  ];
}

/** Không đọc được nguồn nào vẫn phải lưu, nếu không mỗi lượt xem lại tra lại. */
export function emptyBrief(): CompanyBrief {
  return {
    verdict: 'unknown',
    summary: 'Chưa tìm được nguồn đánh giá công khai nào về công ty này.',
    pros: [],
    cons: [],
    rating: null,
    reviewCount: null,
    usedSources: [],
  };
}
