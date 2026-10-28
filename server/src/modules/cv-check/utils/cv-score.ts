export const CV_SECTIONS = [
  'experience',
  'education',
  'skills',
  'projects',
  'summary',
  'certifications',
] as const;

export type CvSection = (typeof CV_SECTIONS)[number];

export type CvSegments = {
  sections: CvSection[];
  bullets: string[];
};

export type CvText = {
  text: string;
  pages: number;
  pagesRead: number;
};

type CheckGroup = 'ats' | 'content' | 'structure';

export type CvCheckItem = {
  key: string;
  group: CheckGroup;
  label: string;
  earned: number;
  max: number;
  detail: string;
  sample: string | null;
};

const MIN_CHARS_PER_PAGE = 120;

const MAX_WORDS = 35;

const METRIC_TARGET = 0.5;

const GARBLED = /\(cid:\d+\)|�/;

export const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;

export const PHONE = /(?:\+?\d[\s.()-]?){9,13}\d/;

const ACTION_VERBS = [
  'xây dựng',
  'phát triển',
  'thiết kế',
  'triển khai',
  'tối ưu',
  'quản lý',
  'dẫn dắt',
  'phân tích',
  'tạo',
  'viết',
  'cải thiện',
  'tích hợp',
  'vận hành',
  'thực hiện',
  'điều phối',
  'lập',
  'đàm phán',
  'đào tạo',
  'giảm',
  'tăng',
  'hoàn thành',
  'nghiên cứu',
  'kiểm thử',
  'bảo trì',
  'tư vấn',
  'chăm sóc',
  'mở rộng',
  'thúc đẩy',
  'built',
  'developed',
  'designed',
  'implemented',
  'led',
  'managed',
  'created',
  'optimized',
  'improved',
  'reduced',
  'increased',
  'delivered',
  'launched',
  'automated',
  'integrated',
  'deployed',
  'analyzed',
  'wrote',
  'maintained',
  'migrated',
  'drove',
  'owned',
  'architected',
  'achieved',
  'coordinated',
  'trained',
  'negotiated',
  'tested',
  'researched',
  'established',
  'streamlined',
  'resolved',
  'configured',
  'refactored',
  'mentored',
];

const SECTION_LABELS: Record<CvSection, string> = {
  experience: 'Kinh nghiệm',
  education: 'Học vấn',
  skills: 'Kỹ năng',
  projects: 'Dự án',
  summary: 'Giới thiệu',
  certifications: 'Chứng chỉ',
};

const REQUIRED_SECTIONS: CvSection[] = ['experience', 'education', 'skills'];

const GROUP_LABELS: Record<CheckGroup, string> = {
  ats: 'ATS đọc được',
  content: 'Nội dung',
  structure: 'Cấu trúc',
};

const wordCount = (line: string) => line.trim().split(/\s+/).length;

const startsWithActionVerb = (line: string) => {
  const lower = line.trim().toLowerCase();
  return ACTION_VERBS.some(
    (verb) => lower === verb || lower.startsWith(`${verb} `),
  );
};

export function hasTextLayer({ text, pagesRead }: CvText): boolean {
  const chars = text.replace(/\s/g, '').length;
  return chars / Math.max(1, pagesRead) >= MIN_CHARS_PER_PAGE;
}

function ratioCheck(
  bullets: string[],
  passes: (line: string) => boolean,
  item: Omit<CvCheckItem, 'earned' | 'detail' | 'sample'>,
  describe: (passed: number, total: number) => string,
  target = 1,
): CvCheckItem {
  if (bullets.length === 0) {
    return {
      ...item,
      earned: 0,
      detail: 'Không tìm thấy gạch đầu dòng kinh nghiệm nào để chấm.',
      sample: null,
    };
  }
  const passed = bullets.filter(passes).length;
  const share = Math.min(1, passed / bullets.length / target);
  return {
    ...item,
    earned: Math.round(share * item.max),
    detail: describe(passed, bullets.length),
    sample: bullets.find((line) => !passes(line)) ?? null,
  };
}

export function scoreCv(input: CvText & CvSegments) {
  const { text, pages, bullets, sections } = input;
  const readable = hasTextLayer(input);
  const hasEmail = EMAIL.test(text);
  const hasPhone = PHONE.test(text);
  const found = REQUIRED_SECTIONS.filter((key) => sections.includes(key));
  const missing = REQUIRED_SECTIONS.filter((key) => !sections.includes(key));

  let contactDetail = 'Email và số điện thoại in thành chữ.';
  if (!hasEmail && !hasPhone) {
    contactDetail = 'Không thấy email lẫn số điện thoại dạng chữ.';
  } else if (!hasEmail) {
    contactDetail = 'Không thấy email dạng chữ.';
  } else if (!hasPhone) {
    contactDetail = 'Không thấy số điện thoại dạng chữ.';
  }

  const checks: CvCheckItem[] = [
    {
      key: 'textLayer',
      group: 'ats',
      label: 'File có lớp chữ',
      max: 15,
      earned: readable ? 15 : 0,
      detail: readable
        ? 'Máy lọc đọc được chữ trong file.'
        : 'File gần như không có chữ: nhiều khả năng là ảnh quét, máy lọc không đọc được.',
      sample: null,
    },
    {
      key: 'clean',
      group: 'ats',
      label: 'Không có ký tự hỏng',
      max: 10,
      earned: GARBLED.test(text) ? 0 : 10,
      detail: GARBLED.test(text)
        ? 'Có ký tự hỏng khi máy đọc: font trong file không kèm bảng mã chữ.'
        : 'Máy đọc ra chữ sạch, không có ký tự hỏng.',
      sample: null,
    },
    {
      key: 'contact',
      group: 'ats',
      label: 'Liên hệ in thành chữ',
      max: 5,
      earned: Math.round(((Number(hasEmail) + Number(hasPhone)) / 2) * 5),
      detail: contactDetail,
      sample: null,
    },
    ratioCheck(
      bullets,
      (line) => /\d/.test(line),
      {
        key: 'metrics',
        group: 'content',
        label: 'Số liệu trong từng dòng',
        max: 20,
      },
      (passed, total) =>
        `${passed}/${total} dòng kinh nghiệm có số liệu (nên từ một nửa trở lên).`,
      METRIC_TARGET,
    ),
    ratioCheck(
      bullets,
      startsWithActionVerb,
      {
        key: 'actionVerbs',
        group: 'content',
        label: 'Mở đầu bằng động từ hành động',
        max: 15,
      },
      (passed, total) =>
        `${passed}/${total} dòng mở đầu bằng động từ hành động (xây dựng, triển khai, built, led…).`,
    ),
    ratioCheck(
      bullets,
      (line) => wordCount(line) <= MAX_WORDS,
      { key: 'concise', group: 'content', label: 'Câu gọn', max: 10 },
      (passed, total) =>
        `${total - passed}/${total} dòng dài quá ${MAX_WORDS} chữ.`,
    ),
    {
      key: 'sections',
      group: 'structure',
      label: 'Đủ mục chính',
      max: 15,
      earned: found.length * 5,
      detail:
        missing.length === 0
          ? 'Đủ mục Kinh nghiệm, Học vấn, Kỹ năng.'
          : `Không thấy mục ${missing.map((key) => SECTION_LABELS[key]).join(', ')}.`,
      sample: null,
    },
    {
      key: 'length',
      group: 'structure',
      label: 'Độ dài 1–2 trang',
      max: 10,
      earned: pages <= 2 ? 10 : 0,
      detail: `CV dài ${pages} trang (nên 1–2 trang).`,
      sample: null,
    },
  ];

  const groups = (Object.keys(GROUP_LABELS) as CheckGroup[]).map((group) => {
    const items = checks.filter((check) => check.group === group);
    return {
      key: group,
      label: GROUP_LABELS[group],
      earned: items.reduce((sum, check) => sum + check.earned, 0),
      max: items.reduce((sum, check) => sum + check.max, 0),
    };
  });

  const flags = checks
    .filter((check) => check.earned < check.max)
    .sort((a, b) => b.max - b.earned - (a.max - a.earned))
    .slice(0, 3);

  return {
    score: checks.reduce((sum, check) => sum + check.earned, 0),
    groups,
    checks,
    flags,
  };
}
