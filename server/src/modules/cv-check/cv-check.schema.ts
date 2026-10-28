import { z } from 'zod';
import {
  boundedList,
  cappedText,
  cappedTextVi,
  looseEnum,
  optionalCappedText,
} from '@/common/model-output';
import { CV_SECTIONS, type CvSection } from './utils/cv-score';
import { ATS_CHECKS, REVIEW_SECTIONS } from './utils/cv-review';

const isSection = (value: string): value is CvSection =>
  (CV_SECTIONS as readonly string[]).includes(value);

const issueSchema = z.object({
  title: cappedTextVi(90, 'Tên lỗi ngắn gọn.'),
  impact: looseEnum(['ats', 'recruiter', 'both'], 'recruiter').describe(
    'Lỗi hại ở đâu: ats (máy lọc hồ sơ), recruiter (người đọc) hay both.',
  ),
  why: cappedTextVi(260, 'Vì sao đây là vấn đề, chỉ ra chỗ cụ thể.'),
  quote: optionalCappedText(
    400,
    'Đoạn chép NGUYÊN VĂN từ CV mà lỗi này nói tới.',
  ),
  rewrite: optionalCappedText(
    400,
    'Cách viết lại đoạn trích, cùng ngôn ngữ với CV. Chỗ cần số liệu mà CV không có thì viết [__].',
  ),
});

const sectionSchema = z.object({
  section: looseEnum([...REVIEW_SECTIONS, 'other'], 'other'),
  verdict: looseEnum(['ok', 'fix', 'missing'], 'fix').describe(
    'ok: ổn; fix: nên sửa; missing: CV không có mục này.',
  ),
  note: cappedTextVi(260, 'Một câu kết luận về mục này.'),
  issues: z
    .array(issueSchema)
    .transform((items) => items.slice(0, 4))
    .default([]),
});

const questionSchema = z.object({
  question: cappedTextVi(
    300,
    'Câu hỏi nhà tuyển dụng dễ hỏi, bám vào một chỗ cụ thể trong CV.',
  ),
  topic: cappedText(40, 'Chủ đề ngắn, ví dụ React, Làm việc nhóm.'),
  level: looseEnum(['basic', 'intermediate', 'advanced'], 'intermediate'),
  why: cappedTextVi(260, 'Vì sao câu này được hỏi, chỉ ra chỗ trong CV.'),
  hint: cappedTextVi(400, 'Gợi ý ý chính nên trả lời.'),
});

const jobSchema = z.object({
  title: cappedText(100, 'Chức danh, chép nguyên văn.'),
  company: optionalCappedText(100, 'Tên công ty, chép nguyên văn.'),
  dates: optionalCappedText(40, 'Mốc thời gian, chép nguyên văn.'),
});

const educationSchema = z.object({
  school: cappedText(120, 'Tên trường, chép nguyên văn.'),
  degree: optionalCappedText(120, 'Ngành hoặc bằng cấp, chép nguyên văn.'),
  dates: optionalCappedText(40, 'Mốc thời gian, chép nguyên văn.'),
});

const atsSchema = z.object({
  key: looseEnum([...ATS_CHECKS, 'other'], 'other'),
  status: looseEnum(['pass', 'warn', 'fail'], 'warn'),
  note: cappedTextVi(200, 'Một câu giải thích, chỉ ra chỗ cụ thể nếu có.'),
});

export const cvReviewSchema = z.object({
  sections: z
    .array(looseEnum([...CV_SECTIONS, 'other'], 'other'))
    .describe('Các mục CV có.')
    .transform((items) => [...new Set(items.filter(isSection))]),
  bullets: boundedList(
    cappedText(400, 'Một gạch đầu dòng chép nguyên văn từ CV.'),
    60,
  ).describe(
    'Mọi gạch đầu dòng trong mục Kinh nghiệm và Dự án, chép nguyên văn.',
  ),
  name: optionalCappedText(80, 'Họ tên ứng viên, chép nguyên văn.'),
  jobs: z
    .array(jobSchema)
    .describe('Từng vị trí trong mục Kinh nghiệm.')
    .transform((items) => items.slice(0, 8))
    .default([]),
  education: z
    .array(educationSchema)
    .describe('Từng trường trong mục Học vấn.')
    .transform((items) => items.slice(0, 4))
    .default([]),
  skills: boundedList(
    cappedText(50, 'Một kỹ năng, chép nguyên văn.'),
    30,
  ).default([]),
  summary: cappedTextVi(
    600,
    'Nhận xét chung 2-3 câu: CV hợp vị trí gì, điểm mạnh nhất, chỗ hụt lớn nhất.',
  ),
  targetRole: cappedText(
    80,
    'Vị trí CV đang hướng tới, ví dụ Frontend Developer (React).',
  ),
  level: looseEnum(
    ['intern', 'fresher', 'junior', 'middle', 'senior', 'lead', 'unknown'],
    'unknown',
  ),
  review: z
    .array(sectionSchema)
    .describe('Nhận xét từng mục của CV.')
    .transform((items) => items.slice(0, 10)),
  ats: z
    .array(atsSchema)
    .describe('Năm điểm máy lọc hồ sơ hay vấp.')
    .transform((items) => items.slice(0, 10)),
  strengths: boundedList(
    cappedTextVi(200, 'Một điểm mạnh cụ thể của CV.'),
    3,
  ).default([]),
  improvements: boundedList(
    cappedTextVi(200, 'Một điểm cần cải thiện cụ thể của CV.'),
    3,
  ).default([]),
  questions: z
    .array(questionSchema)
    .describe('Câu hỏi phỏng vấn dự đoán.')
    .transform((items) => items.slice(0, 4))
    .default([]),
});

export type CvReviewOutput = z.infer<typeof cvReviewSchema>;
