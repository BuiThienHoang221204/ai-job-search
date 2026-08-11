/// Bốn thẻ "Gợi ý từ AI" trên màn hình Tổng quan.
///
/// KHÔNG gọi model. Mọi gợi ý đều suy ra được từ dữ liệu đã có trong
/// database: hồ sơ thiếu gì, kỹ năng nào lặp lại trong các tin không đạt,
/// việc nào đang điểm cao. Gọi model ở đây sẽ đợi vài chục giây và phụ thuộc
/// gateway, để đổi lấy đúng những kết luận mà một câu SQL đã trả lời được.
///
/// Tên "Gợi ý từ AI" trên giao diện vẫn đúng theo nghĩa rộng: dữ liệu dùng để
/// suy ra đều do AI chấm điểm sinh ra.

export type SuggestionType = 'cv' | 'apply' | 'network' | 'skill';

export type Suggestion = {
  id: string;
  type: SuggestionType;
  title: string;
  description: string;
  /// Cho giao diện điều hướng khi bấm vào thẻ.
  href?: string;
};

export type SuggestionInput = {
  profileCompletion: number;
  /// Tên tiếng Việt của các mục hồ sơ còn trống, đã sắp theo độ quan trọng.
  missingProfileFields: string[];
  /// Kỹ năng xuất hiện nhiều nhất trong `gaps` của các lần chấm điểm.
  recurringGaps: Array<{ skill: string; jobCount: number }>;
  totalMatches: number;
  topMatch: {
    jobId: string;
    company: string;
    score: number;
    daysOld: number;
  } | null;
  /// Số tin bị loại vì không đủ điều kiện - đáng chú ý nếu cao bất thường.
  ineligibleCount: number;
};

/// Ngưỡng trên nó mới coi là "rất phù hợp, nên nộp sớm".
const HOT_MATCH_SCORE = 85;
const HOT_MATCH_MAX_DAYS = 7;

export function buildSuggestions(input: SuggestionInput): Suggestion[] {
  const suggestions: Suggestion[] = [];

  // 1. Hồ sơ chưa đầy đủ làm mọi kết quả chấm điểm kém tin cậy, nên nó đứng
  // đầu.
  if (input.profileCompletion < 100 && input.missingProfileFields.length) {
    const missing = input.missingProfileFields.slice(0, 3).join(', ');
    suggestions.push({
      id: 'profile-incomplete',
      type: 'cv',
      title: `Hoàn thiện hồ sơ (${input.profileCompletion}%)`,
      description: `Còn thiếu: ${missing}. Hồ sơ đầy đủ giúp việc chấm điểm phù hợp chính xác hơn đáng kể.`,
      href: '/dashboard/profile',
    });
  }

  // 2. Kỹ năng lặp lại ở nhiều tin là thiếu hụt có hệ thống, không phải ngẫu
  // nhiên.
  const topGap = input.recurringGaps[0];
  if (topGap && topGap.jobCount >= 2) {
    suggestions.push({
      id: `skill-${topGap.skill.toLowerCase().replace(/\s+/g, '-')}`,
      type: 'skill',
      title: `Học ${topGap.skill}`,
      description:
        input.totalMatches > 0
          ? `${topGap.jobCount}/${input.totalMatches} việc đã chấm yêu cầu kỹ năng này mà hồ sơ chưa có.`
          : `${topGap.jobCount} việc yêu cầu kỹ năng này mà hồ sơ chưa có.`,
      href: '/dashboard/upskill',
    });
  }

  // 3. Việc điểm cao và còn mới - đây là thẻ duy nhất có tính thời hạn.
  if (
    input.topMatch &&
    input.topMatch.score >= HOT_MATCH_SCORE &&
    input.topMatch.daysOld <= HOT_MATCH_MAX_DAYS
  ) {
    suggestions.push({
      id: `apply-${input.topMatch.jobId}`,
      type: 'apply',
      title: `${input.topMatch.company} đang tuyển gấp`,
      description: `Tin mới nhất đạt ${input.topMatch.score}% phù hợp với hồ sơ của bạn — nên ứng tuyển sớm.`,
      href: `/dashboard/jobs/${input.topMatch.jobId}`,
    });
  }

  // 4. Nhiều tin bị loại vì điều kiện là dấu hiệu tìm sai hướng, không phải
  // hồ sơ yếu. Chỉ báo khi nó chiếm phần đáng kể.
  if (
    input.ineligibleCount >= 2 &&
    input.ineligibleCount * 3 >= input.totalMatches
  ) {
    suggestions.push({
      id: 'ineligible-high',
      type: 'network',
      title: 'Nhiều tin không đủ điều kiện ứng tuyển',
      description: `${input.ineligibleCount}/${input.totalMatches} việc bị loại ở bước xét điều kiện. Cân nhắc điều chỉnh tiêu chí tìm kiếm.`,
      href: '/dashboard/jobs',
    });
  }

  // 5. Chưa có dữ liệu thì báo điều cần làm trước, thay vì để ô trống.
  if (!suggestions.length && input.totalMatches === 0) {
    suggestions.push({
      id: 'no-jobs',
      type: 'apply',
      title: 'Bắt đầu bằng một lần quét việc',
      description:
        'Chưa có công việc nào được chấm điểm. Quét tin tuyển dụng để hệ thống bắt đầu đánh giá độ phù hợp.',
      href: '/dashboard/jobs',
    });
  }

  return suggestions.slice(0, 4);
}
