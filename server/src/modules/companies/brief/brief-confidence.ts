import { isReviewHost } from '../research/review-sources.js';

export type BriefConfidence = 'high' | 'medium' | 'low';

/**
 * Độ tin cậy suy từ số nguồn thật sự đọc được, không hỏi model. Một trang đánh
 * giá chuyên nặng hơn ba bài blog, nên số lượng một mình không đủ để lên `high`.
 */
export function confidenceOf(urls: string[]): BriefConfidence {
  const total = urls.length;
  const known = urls.filter(isReviewHost).length;

  if (total === 0) return 'low';
  if (known >= 1 && total >= 2) return 'high';
  if (known >= 1 || total >= 3) return 'medium';
  return 'low';
}
