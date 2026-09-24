import type { Job } from '../../../generated/prisma/client.js';

/** Hai mục của file skill được giữ lại, khai ở đây để prompt và test đọc cùng một danh sách. */
export const PREP_SECTIONS = [
  'star format',
  'common tough questions',
  'questions you should ask',
];

export const BEHAVIOURAL_SECTIONS = [
  'behavioral',
  'strengths',
  'communication',
  'working style',
];

export type PrepPromptInput = {
  framework: string;
  behavioural: string;
  profileSummary: string;
  job: Pick<Job, 'title' | 'company' | 'location' | 'description'>;
  gaps: string[];
};

export function buildPrepPrompt(input: PrepPromptInput): {
  system: string;
  prompt: string;
} {
  const system = [
    'Bạn là huấn luyện viên phỏng vấn. Soạn bộ chuẩn bị phỏng vấn cho một ứng viên trước một vị trí cụ thể.',
    '',
    'Quy tắc bắt buộc:',
    '- Mọi câu chuyện STAR phải dựa trên kinh nghiệm CÓ THẬT trong hồ sơ. Tuyệt đối không bịa dự án, con số hay công ty.',
    '- Hồ sơ thiếu dữ liệu cho một năng lực nào đó thì đưa năng lực đó vào likelyProbes, không dùng câu chuyện tưởng tượng để lấp chỗ trống.',
    '- Câu hỏi đề nghị ứng viên hỏi lại phải gắn với công ty và vị trí này, không phải câu hỏi chung chung.',
    '- Viết tiếng Việt có dấu. Mỗi trường là một đoạn văn hoàn chỉnh, không phải cụm từ rời rạc.',
    '',
    '--- KHUNG CHUẨN BỊ PHỎNG VẤN ---',
    input.framework,
    '',
    '--- HỒ SƠ HÀNH VI ---',
    input.behavioural,
  ].join('\n');

  const gapsBlock = input.gaps.length
    ? [
        '',
        '=== KHOẢNG TRỐNG ĐÃ XÁC ĐỊNH KHI CHẤM ĐIỂM ===',
        ...input.gaps.map((gap) => `- ${gap}`),
        'Nhà tuyển dụng nhiều khả năng sẽ đào vào đúng những điểm này.',
      ].join('\n')
    : '';

  const prompt = [
    '=== HỒ SƠ ỨNG VIÊN ===',
    input.profileSummary,
    gapsBlock,
    '',
    '=== VỊ TRÍ ỨNG TUYỂN ===',
    `Chức danh: ${input.job.title}`,
    `Công ty: ${input.job.company}`,
    `Địa điểm: ${input.job.location ?? 'không rõ'}`,
    '',
    'Mô tả:',
    input.job.description,
  ].join('\n');

  return { system, prompt };
}
