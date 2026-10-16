import { Injectable, Logger } from '@nestjs/common';
import type { Profile } from '@/generated/prisma/client';
import { NOT_PROVIDED } from '../utils/shared-placeholders';

function listOrMissing(values: string[] | undefined | null): string {
  return values && values.length ? values.join(', ') : NOT_PROVIDED;
}

function textOrMissing(value: string | null | undefined): string {
  return value?.trim() || NOT_PROVIDED;
}

function careerGoal(profile: Profile | null, index: number): string {
  return profile?.careerGoals?.[index] ?? NOT_PROVIDED;
}

function pushLine(
  lines: string[],
  label: string,
  value: string | null | undefined,
): void {
  if (value?.trim()) lines.push(`- ${label}: ${value.trim()}`);
}

function pushListLine(
  lines: string[],
  label: string,
  values: string[] | null | undefined,
): void {
  if (values?.length) lines.push(`- ${label}: ${values.join(', ')}`);
}

@Injectable()
export class PromptBuilderService {
  private readonly logger = new Logger(PromptBuilderService.name);

  private placeholders(profile: Profile | null): Record<string, string> {
    return {
      YOUR_NAME: NOT_PROVIDED,
      YOUR_PRIMARY_SKILLS: listOrMissing(profile?.primarySkills),
      YOUR_SECONDARY_SKILLS: listOrMissing(profile?.secondarySkills),
      SKILLS_YOU_LACK: listOrMissing(profile?.lackingSkills),
      YOUR_DIRECT_EXPERIENCE_DOMAINS: listOrMissing(
        profile?.directExperienceDomains,
      ),
      YOUR_ADJACENT_EXPERIENCE: listOrMissing(profile?.adjacentExperience),
      ROLES_WITH_LIMITED_EXPERIENCE: listOrMissing(profile?.lackingSkills),
      YOUR_CAREER_GOAL_1: careerGoal(profile, 0),
      YOUR_CAREER_GOAL_2: careerGoal(profile, 1),
      YOUR_CAREER_GOAL_3: careerGoal(profile, 2),
      YOUR_ENERGIZING_TASKS: listOrMissing(profile?.energizingTasks),
      YOUR_DRAINING_TASKS: listOrMissing(profile?.drainingTasks),
      YOUR_COMMUTE_CONSTRAINTS: textOrMissing(profile?.commuteConstraint),
      YOUR_CITY: textOrMissing(profile?.location),
      YOUR_COUNTRY: textOrMissing(profile?.country),
      YOUR_LANGUAGES: listOrMissing(profile?.languages),
      YOUR_EMPLOYMENT_STATUS: textOrMissing(profile?.employmentStatus),
      YOUR_LINKEDIN_HEADLINE: textOrMissing(profile?.headline),
      YOUR_FINANCIAL_SITUATION_CONTEXT: NOT_PROVIDED,
      YOUR_SCHEDULE_CONSTRAINTS: textOrMissing(profile?.commuteConstraint),
      YOUR_GROWTH_PRIORITIES: listOrMissing(profile?.careerGoals),
    };
  }

  /** Thay placeholder trong một đoạn skill. */
  render(template: string, profile: Profile | null): string {
    const table = this.placeholders(profile);
    const unresolved = new Set<string>();

    const rendered = template.replace(
      /\[([A-Z][A-Z0-9_]{2,})\]/g,
      (match, token: string) => {
        if (token in table) return table[token];
        unresolved.add(token);
        return NOT_PROVIDED;
      },
    );

    if (unresolved.size) {
      this.logger.debug(
        `Placeholder chưa có ánh xạ: ${[...unresolved].join(', ')}`,
      );
    }
    return rendered;
  }

  /** Giữ lại một số mục `##` của file skill và bỏ phần còn lại. */
  keepSections(markdown: string, headings: string[]): string {
    const wanted = headings.map((heading) => heading.toLowerCase());
    const blocks = markdown.split(/^## /m);
    const kept: string[] = [];

    for (const block of blocks.slice(1)) {
      const title = block.split('\n', 1)[0].trim().toLowerCase();
      if (wanted.some((heading) => title.startsWith(heading)))
        kept.push(`## ${block.trimEnd()}`);
    }

    return kept.join('\n\n');
  }

  dropSubsection(markdown: string, heading: string): string {
    const pattern = new RegExp(
      `^### .*${heading}[\\s\\S]*?(?=^### |^## |(?![\\s\\S]))`,
      'gmi',
    );
    return markdown.replace(pattern, '');
  }

  /** Tóm tắt hồ sơ thành khối văn bản đưa vào prompt. */
  profileSummary(profile: Profile | null): string {
    if (!profile) return 'Ứng viên chưa hoàn thiện hồ sơ.';

    const lines: string[] = [];
    pushLine(lines, 'Chức danh', profile.headline);
    pushLine(lines, 'Địa điểm', profile.location);
    pushLine(lines, 'Quốc gia', profile.country);
    pushListLine(lines, 'Ngôn ngữ', profile.languages);
    pushLine(lines, 'Tình trạng', profile.employmentStatus);
    pushLine(lines, 'Quốc tịch', profile.citizenship);
    pushLine(lines, 'Giấy phép lao động', profile.workPermit);
    pushListLine(lines, 'Kỹ năng chính', profile.primarySkills);
    pushListLine(lines, 'Kỹ năng phụ', profile.secondarySkills);
    pushListLine(lines, 'Kỹ năng còn thiếu', profile.lackingSkills);
    pushListLine(
      lines,
      'Lĩnh vực có kinh nghiệm trực tiếp',
      profile.directExperienceDomains,
    );
    pushListLine(lines, 'Kinh nghiệm liên quan', profile.adjacentExperience);
    pushListLine(lines, 'Mục tiêu nghề nghiệp', profile.careerGoals);
    pushListLine(lines, 'Công việc tạo hứng thú', profile.energizingTasks);
    pushListLine(lines, 'Công việc gây chán nản', profile.drainingTasks);
    pushListLine(lines, 'Ngành mục tiêu', profile.targetSectors);
    pushListLine(lines, 'Điều không chấp nhận', profile.dealBreakers);
    pushLine(lines, 'Ràng buộc đi lại', profile.commuteConstraint);
    pushLine(lines, 'Ưu tiên làm việc từ xa', profile.remotePreference);
    lines.push(
      `- Sẵn sàng chuyển nơi ở: ${profile.willingToRelocate ? 'có' : 'không'}`,
    );
    pushLine(lines, 'Giới thiệu', profile.summary);

    if (profile.experiences) {
      lines.push(
        `- Kinh nghiệm làm việc (JSON): ${this.clipJson(profile.experiences, 1500)}`,
      );
    }
    if (profile.projects) {
      lines.push(`- Dự án (JSON): ${this.clipJson(profile.projects, 1200)}`);
    }
    if (profile.educations) {
      lines.push(`- Học vấn (JSON): ${this.clipJson(profile.educations, 800)}`);
    }
    if (profile.certificates) {
      lines.push(
        `- Chứng chỉ (JSON): ${this.clipJson(profile.certificates, 600)}`,
      );
    }
    if (profile.behavioralTraits) {
      lines.push(
        `- Đặc điểm hành vi (JSON): ${this.clipJson(profile.behavioralTraits, 600)}`,
      );
    }

    const joined = lines.join('\n');
    if (joined.length > 4000) {
      return `${joined.slice(0, 4000)}\n… [cắt ${joined.length - 4000} ký tự hồ sơ]`;
    }
    return joined;
  }

  private clipJson(value: unknown, limit: number): string {
    const text = JSON.stringify(value);
    if (text.length <= limit) return text;
    return `${text.slice(0, limit)}… [cắt ${text.length - limit} ký tự]`;
  }
}
