import {
  LANGUAGE_RULE,
  type OutputLanguage,
} from '../../../common/model-output.js';
import type { LetterTarget } from './letter-target.js';

/** Timeout cho việc soạn CV và thư xin việc — đo được 39–84s, xem CLAUDE.md mục "Đo trước khi đoán". */
export const DOCUMENT_TIMEOUT_MS = 180_000;

/** Mục của file skill mà từng loại tài liệu giữ lại; đổi tiêu đề trong `.md` thì `keepSections` trả về RỖNG. */
export const CV_SECTIONS = ['section-by-section tailoring'];
export const LETTER_SECTIONS = [
  'tailoring guidelines',
  'checklist before finalizing',
];
export const WRITING_SECTIONS = [
  'critical rules',
  'tone',
  'bullet point style',
];
export const FORM_SECTIONS = [
  'the rule that governs everything here',
  'field type: self-introduction paragraph',
  'field type: structured project entries',
  'field type: hard character limits',
];

/** Phần khung dùng chung: đây là thứ chặn model bịa ra công ty, con số và chứng chỉ. */
export function groundingRules(language: OutputLanguage = 'vi'): string[] {
  return [
    'Quy tắc không được phá:',
    '- Mọi câu phải được chứng minh bằng thông tin CÓ THẬT trong hồ sơ. Không thêm công ty, chức danh, con số, chứng chỉ hay kỹ năng không có trong đó.',
    '- Được phép viết lại cách diễn đạt, đổi thứ tự, chọn lọc thông tin để bám yêu cầu công việc. KHÔNG được phép thêm sự kiện mới.',
    '- Hồ sơ thiếu dữ liệu cho một yêu cầu nào đó thì bỏ qua yêu cầu đó, không lấp chỗ trống bằng phỏng đoán.',
    `- ${LANGUAGE_RULE[language]} Không dùng dấu gạch ngang dài, không dùng sáo ngữ.`,
  ];
}

/** Phần đã tra sẵn từ file skill và từ database; hàm dựng prompt không tự đi lấy. */
type Sources = {
  framework: string;
  writingRules: string;
  profileSummary: string;
  /** Thế mạnh và khoảng trống lượt chấm điểm đã tìm ra. Rỗng với JD dán tay. */
  matchHints?: string[];
};

const targetBlock = (target: LetterTarget): string[] => [
  `${target.title} @ ${target.company}`,
  target.description,
];

export function cvPrompt(
  sources: Sources,
  target: LetterTarget | null,
  language: OutputLanguage,
): { system: string; prompt: string } {
  const system = [
    'Bạn là chuyên gia viết CV. Soạn nội dung CV bám sát một vị trí cụ thể.',
    '',
    ...groundingRules(language),
    '- Dự án trong hồ sơ phải nằm ở mục projects. KHÔNG được viết dự án thành một mục kinh nghiệm làm việc: cả người đọc lẫn máy đọc CV sẽ hiểu nhầm thành nhiều nơi làm việc khác nhau.',
    '- Chọn 3-4 dự án bám sát tin tuyển dụng nhất, không liệt kê hết. Hồ sơ không có dự án nào thì để projects là mảng rỗng.',
    '- Trường tools của dự án là công cụ hoặc phương pháp thuộc NGÀNH của ứng viên, không mặc định là công nghệ phần mềm. Hồ sơ không nêu thì để rỗng.',
    '',
    '--- HƯỚNG DẪN TỪNG MỤC ---',
    sources.framework,
    '',
    '--- QUY TẮC VĂN PHONG ---',
    sources.writingRules,
  ].join('\n');

  const prompt = [
    `CV language: ${language === 'en' ? 'English' : 'Vietnamese'}`,
    '=== HỒ SƠ ỨNG VIÊN ===',
    sources.profileSummary,
    '',
    target
      ? ['=== VỊ TRÍ NHẮM TỚI ===', ...targetBlock(target)].join('\n')
      : '=== KHÔNG CÓ VỊ TRÍ CỤ THỂ: soạn CV tổng quát theo định hướng nghề nghiệp ===',
  ].join('\n');

  return { system, prompt };
}

export function coverLetterPrompt(
  sources: Sources,
  target: LetterTarget,
): { system: string; prompt: string } {
  const system = [
    'Bạn là chuyên gia viết thư xin việc.',
    '',
    ...groundingRules(),
    '- Thư dài tối đa một trang: tổng cộng không quá 4 đoạn.',
    '',
    '--- HƯỚNG DẪN ---',
    sources.framework,
    '',
    '--- QUY TẮC VĂN PHONG ---',
    sources.writingRules,
  ].join('\n');

  const prompt = [
    '=== HỒ SƠ ỨNG VIÊN ===',
    sources.profileSummary,
    ...(sources.matchHints ?? []),
    '',
    '=== VỊ TRÍ ỨNG TUYỂN ===',
    ...targetBlock(target),
  ].join('\n');

  return { system, prompt };
}

export function applicationEmailPrompt(
  sources: Sources,
  target: LetterTarget,
  candidateName: string,
): { system: string; prompt: string } {
  const system = [
    'Bạn soạn MAIL ỨNG TUYỂN để ứng viên gửi thẳng cho nhà tuyển dụng, không phải thư xin việc đính kèm PDF.',
    '',
    ...groundingRules(),
    '- Mail được đọc trên điện thoại: tối đa 3 đoạn, tổng cộng 150-250 chữ. Dài hơn là hỏng, không phải là kỹ hơn.',
    '- Không kể lại toàn bộ CV. Chọn đúng hai tới ba điểm khớp nhất với tin này, phần còn lại để CV nói.',
    '- Không bịa tên người nhận, không bịa nguồn biết tin, không nêu mức lương nếu hồ sơ không có.',
    '- KHÔNG viết tên, email hay số điện thoại vào bất kỳ trường nào. Hệ thống tự ghép chữ ký từ hồ sơ.',
    '',
    '--- HƯỚNG DẪN ---',
    sources.framework,
    '',
    '--- QUY TẮC VĂN PHONG ---',
    sources.writingRules,
  ].join('\n');

  const prompt = [
    '=== HỒ SƠ ỨNG VIÊN ===',
    `Tên ứng viên (dùng cho tiêu đề mail): ${candidateName}`,
    sources.profileSummary,
    ...(sources.matchHints ?? []),
    '',
    '=== VỊ TRÍ ỨNG TUYỂN ===',
    ...targetBlock(target),
  ].join('\n');

  return { system, prompt };
}

export function formAnswerPrompt(
  sources: Pick<Sources, 'framework' | 'profileSummary'>,
  target: LetterTarget | null,
  question: string,
  characterLimit?: number,
): { system: string; prompt: string } {
  const system = [
    'Bạn soạn câu trả lời cho ô văn bản tự do trong form ứng tuyển trực tuyến.',
    '',
    ...groundingRules(),
    '- Ô form không phải chỗ để đưa ra thông tin mới. Đây là chỗ CHỌN LỌC từ những gì đã có và sắp xếp lại cho đúng câu hỏi.',
    characterLimit
      ? `- Giới hạn cứng: ${characterLimit} ký tự. Mọi phương án phải nằm trong giới hạn này.`
      : '- Không có giới hạn ký tự cụ thể, ưu tiên 100-200 từ.',
    '',
    '--- HƯỚNG DẪN ---',
    sources.framework,
  ].join('\n');

  const prompt = [
    '=== HỒ SƠ ỨNG VIÊN ===',
    sources.profileSummary,
    '',
    target ? ['=== VỊ TRÍ ===', ...targetBlock(target)].join('\n') : '',
    '',
    '=== CÂU HỎI TRONG FORM ===',
    question,
  ].join('\n');

  return { system, prompt };
}
