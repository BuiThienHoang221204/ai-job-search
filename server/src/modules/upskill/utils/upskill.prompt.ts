import type { JobRequirement } from '../../../generated/prisma/client.js';
import type { UpskillGaps } from '../upskill.schema.js';

/** Mục của file skill mà từng lời gọi giữ lại; đổi tiêu đề trong `.md` thì `keepSections` trả về RỖNG. */
export const GAPS_SECTIONS = ['step 3', 'step 4', 'step 5'];
export const PLAN_SECTIONS = ['step 6', 'step 7'];

/** Số ký tự mô tả thô dùng khi tin CHƯA có yêu cầu đã rút. */
export const RAW_DESCRIPTION_CHARS = 600;

export type ScoredJob = {
  overallScore: number | null;
  gaps: string[];
  job: {
    title: string;
    company: string;
    tags: string[];
    description: string;
    requirements: JobRequirement | null;
  };
};

export const GAPS_SYSTEM = [
  'Bạn là cố vấn phát triển nghề nghiệp. Nhiệm vụ của bạn ở bước này là TÌM KHOẢNG TRỐNG giữa hồ sơ ứng viên và các vị trí họ đang nhắm tới.',
  'Chưa đề xuất lộ trình học ở bước này — sẽ có một bước riêng làm việc đó.',
  '',
  'Quy tắc bắt buộc:',
  '- Chỉ liệt kê kỹ năng mà tin tuyển dụng THẬT SỰ đòi hỏi và hồ sơ THẬT SỰ chưa có. Kỹ năng hồ sơ đã có dù chỉ ở dạng tương đương thì bỏ qua.',
  '- Công việc có điểm phù hợp thấp đóng góp nhiều hơn vào độ ưu tiên: trọng số là (100 - điểm) / 100.',
  '- synthesisedGaps không được lặp lại bất kỳ mục nào trong hardGaps.',
  '- Viết tiếng Việt có dấu, mỗi trường là câu hoàn chỉnh.',
].join('\n');

export const PLAN_SYSTEM = [
  'Bạn là cố vấn phát triển nghề nghiệp. Danh sách khoảng trống đã được phân tích xong ở bước trước; nhiệm vụ của bạn là biến nó thành LỘ TRÌNH HỌC.',
  '',
  'Quy tắc bắt buộc:',
  '- Chỉ lập lộ trình cho những khoảng trống được liệt kê dưới đây. Không thêm kỹ năng mới, không bỏ qua khoảng trống có priority cao.',
  '- Nguồn học phải là thứ có thật và gọi tên được. Không bịa URL.',
  '- Thứ tự học đi theo phụ thuộc trước, độ ưu tiên sau: cái nào mở khóa được nhiều thứ khác thì học trước.',
  '- Lời khuyên phải bám vào hồ sơ ứng viên: nói rõ chỗ nào bỏ qua được vì họ đã biết, chỗ nào phải học từ đầu.',
  '- Viết tiếng Việt có dấu, mỗi trường là câu hoàn chỉnh.',
].join('\n');

/**
 * Yêu cầu ĐÃ RÚT nếu có, mô tả thô nếu chưa. Phải kiểm `status === 'DONE'`:
 * bản ghi PENDING/FAILED vẫn tồn tại với mảng kỹ năng RỖNG, nên chỉ kiểm khác
 * null là gửi cho model một khối trống mà không có gì báo.
 */
export function jobFacts(job: ScoredJob['job']): string[] {
  const requirements = job.requirements;

  if (requirements?.status !== 'DONE' || !requirements.requiredSkills.length) {
    return [
      `   trích mô tả: ${job.description.slice(0, RAW_DESCRIPTION_CHARS)}`,
    ];
  }

  const years = requirements.minYears
    ? `${requirements.minYears} năm`
    : 'không nêu';

  return [
    `   yêu cầu bắt buộc: ${requirements.requiredSkills.join(', ')}`,
    requirements.niceToHaveSkills.length
      ? `   ưu tiên: ${requirements.niceToHaveSkills.join(', ')}`
      : '',
    `   kinh nghiệm: ${years}, cấp ${requirements.seniority}`,
  ].filter(Boolean);
}

/** Trọng số gap: tin càng ít phù hợp càng nói lên nhiều về chỗ ứng viên còn thiếu. */
export function gapsPrompt(
  framework: string,
  profileSummary: string,
  matches: ScoredJob[],
): { system: string; prompt: string } {
  const system = [GAPS_SYSTEM, '', '--- KHUNG PHÂN TÍCH ---', framework].join(
    '\n',
  );

  const jobLines = matches.map((match, index) => {
    const fit = match.overallScore ?? 0;
    const weight = ((100 - fit) / 100).toFixed(2);
    return [
      `${index + 1}. ${match.job.title} @ ${match.job.company}`,
      `   điểm phù hợp: ${fit}/100, trọng số gap: ${weight}`,
      `   từ khóa: ${match.job.tags.join(', ') || 'không có'}`,
      match.gaps.length
        ? `   khoảng trống đã ghi nhận: ${match.gaps.join('; ')}`
        : '',
      ...jobFacts(match.job),
    ]
      .filter(Boolean)
      .join('\n');
  });

  const prompt = [
    '=== HỒ SƠ ỨNG VIÊN ===',
    profileSummary,
    '',
    `=== ${matches.length} CÔNG VIỆC ĐÃ CHẤM ĐIỂM (sắp theo điểm tăng dần) ===`,
    ...jobLines,
  ].join('\n');

  return { system, prompt };
}

/** Lời gọi 2 KHÔNG mang mô tả công việc — thêm lại là quay về đúng bản một-lời-gọi đã hỏng. */
export function planPrompt(
  framework: string,
  profileSummary: string,
  gaps: UpskillGaps,
): { system: string; prompt: string } {
  const system = [PLAN_SYSTEM, '', '--- KHUNG PHÂN TÍCH ---', framework].join(
    '\n',
  );

  // Sắp ở TypeScript chứ không tin model đã sắp: nhãn "sắp theo độ ưu tiên"
  // trong prompt phải đúng, không thì nó là một câu nói dối gửi cho model.
  const hardLines = [...gaps.hardGaps]
    .sort((a, b) => b.priority - a.priority)
    .map(
      (gap) =>
        `- ${gap.skill} (ưu tiên ${gap.priority}/100, ${gap.demandCount} công việc đòi hỏi): ${gap.evidence}`,
    );
  const synthesisedLines = gaps.synthesisedGaps.map(
    (gap) => `- [${gap.category}] ${gap.gap}: ${gap.why}`,
  );

  const prompt = [
    '=== HỒ SƠ ỨNG VIÊN ===',
    profileSummary,
    '',
    '=== KHOẢNG TRỐNG KỸ NĂNG CỨNG (sắp theo độ ưu tiên) ===',
    ...(hardLines.length ? hardLines : ['(không có)']),
    '',
    '=== KHOẢNG TRỐNG SUY LUẬN ===',
    ...(synthesisedLines.length ? synthesisedLines : ['(không có)']),
  ].join('\n');

  return { system, prompt };
}
