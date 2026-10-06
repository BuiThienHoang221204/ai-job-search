import { fingerprint } from '@/common/fingerprint';

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

export function embeddingSourceHash(text: string): string {
  return fingerprint([text]);
}
