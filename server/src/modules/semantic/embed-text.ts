import { createHash } from 'node:crypto';

/**
 * Dựng đoạn văn bản đưa đi embedding. Hàm thuần, không phụ thuộc gì — nên kiểm
 * được bằng test đơn vị mà không cần model lẫn database.
 *
 * Giới hạn độ dài mô tả: `gemini-embedding-2` nhận 8.192 token, còn mô tả tin
 * tuyển dụng thì có cái dài hơn thế. Cắt ở 4.000 ký tự vì phần đầu của một tin
 * là chức danh và yêu cầu — phần đuôi thường là mô tả công ty và phúc lợi, thứ
 * gần như giống nhau ở mọi tin nên chỉ làm loãng vector.
 */
const MAX_DESCRIPTION_CHARS = 4_000;

export type EmbeddableJob = {
  title: string;
  company: string;
  location: string | null;
  tags: string[];
  description: string;
};

export type EmbeddableProfile = {
  headline: string | null;
  location: string | null;
  summary: string | null;
  primarySkills: string[];
  secondarySkills: string[];
  directExperienceDomains: string[];
  targetSectors: string[];
  careerGoals: string[];
};

const line = (label: string, value: string | null | undefined): string =>
  value?.trim() ? `${label}: ${value.trim()}` : '';

const listLine = (label: string, values: string[] | null): string =>
  values?.length ? `${label}: ${values.join(', ')}` : '';

/** Văn bản đại diện cho một tin tuyển dụng. */
export function jobEmbeddingText(job: EmbeddableJob): string {
  return [
    line('Chức danh', job.title),
    line('Công ty', job.company),
    line('Địa điểm', job.location),
    listLine('Từ khoá', job.tags),
    line('Mô tả', job.description.slice(0, MAX_DESCRIPTION_CHARS)),
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Văn bản đại diện cho một hồ sơ.
 *
 * **CỐ Ý không có thông tin định danh** — không tên, không email, không điện
 * thoại, không quốc tịch. Hai lý do độc lập cùng chỉ về một cách làm:
 *
 * 1. **Kỹ thuật:** tên riêng không đóng góp gì cho độ tương đồng ngữ nghĩa giữa
 *    hồ sơ và tin tuyển dụng. Đưa vào chỉ làm nhiễu vector.
 * 2. **Quyền riêng tư:** đoạn văn bản này được gửi ra dịch vụ ngoài. Free tier
 *    của nhà cung cấp thường cho phép dùng dữ liệu gửi lên để huấn luyện, nên
 *    càng ít dữ liệu cá nhân đi ra càng tốt.
 *
 * Ai định thêm trường vào đây thì cân nhắc điều 2 trước.
 */
export function profileEmbeddingText(profile: EmbeddableProfile): string {
  return [
    line('Chức danh', profile.headline),
    line('Địa điểm', profile.location),
    listLine('Kỹ năng chính', profile.primarySkills),
    listLine('Kỹ năng phụ', profile.secondarySkills),
    listLine('Lĩnh vực có kinh nghiệm', profile.directExperienceDomains),
    listLine('Ngành mục tiêu', profile.targetSectors),
    listLine('Mục tiêu nghề nghiệp', profile.careerGoals),
    line('Giới thiệu', profile.summary),
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Vân tay của đoạn văn bản đã embed. Hồ sơ đổi thì vector phải sinh lại, và so
 * hash rẻ hơn nhiều so với gọi lại model để xem có khác không.
 */
export function embeddingSourceHash(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 32);
}
