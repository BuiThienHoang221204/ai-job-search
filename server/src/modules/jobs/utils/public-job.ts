import type { Prisma } from '@/generated/prisma/client';
import type {
  MatchProfile,
  SkillDictionary,
} from '@/modules/matching/rules/types';
import type { PUBLIC_JOB_DETAIL_SELECT } from '../job-card.select';
import { withSystemMatch } from './job-view';

export const EXCERPT_LENGTH = 300;

const GUEST_PROFILE: MatchProfile = {
  skills: [],
  citizenship: null,
  workPermit: null,
  location: null,
  willingToRelocate: false,
  years: null,
  yearsByOccupation: null,
};

type PublicJobRow = Prisma.JobGetPayload<{
  select: typeof PUBLIC_JOB_DETAIL_SELECT;
}>;

/** Đoạn đầu của mô tả, cắt ở ranh giới từ; khách chỉ thấy đoạn này, toàn văn nằm ở tin gốc. */
export function excerptOf(description: string): string {
  const text = description.replace(/\s+/g, ' ').trim();
  if (text.length <= EXCERPT_LENGTH) return text;
  const cut = text.slice(0, EXCERPT_LENGTH);
  const lastSpace = cut.lastIndexOf(' ');
  const head = lastSpace > 0 ? cut.slice(0, lastSpace) : cut;
  return `${head}…`;
}

/** Chi tiết tin cho khách: yêu cầu của tin đối chiếu với hồ sơ rỗng để hiện đủ danh sách, mô tả chỉ còn đoạn trích. */
export function toPublicJobDetail(
  job: PublicJobRow,
  dictionary: SkillDictionary,
) {
  const detail = withSystemMatch(job, GUEST_PROFILE, dictionary);
  return { ...detail, description: excerptOf(detail.description) };
}
